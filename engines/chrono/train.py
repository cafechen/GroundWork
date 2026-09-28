"""Dynamic train composition with explicitly abstracted stationary depot handling.

Each wagon is a rigid loaded body, two passive wheels and real joints. Insertion
and removal happen only at rest; depot transfer animation is not a rigid-body
crane simulation. SOC is a compressed demonstration model, not battery physics.
"""
import math
import pychrono.core as ch
from physics import Tugger,Route,point,pose,yaw,wrap,clamp

MAX_TRAILERS=3
class TrainTugger(Tugger):
    def __init__(self,system,cfg,index,friction):
        super().__init__(system,cfg,index,friction)
        # Reuse the tested tractor, but start with an empty hitch.
        system.RemoveLink(self.hitch)
        for j in self.trailer_joints:system.RemoveLink(j)
        for w in self.trailer_wheels:system.RemoveBody(w)
        system.RemoveBody(self.trailer)
        self.system=system;self.family=index+1;self.friction=friction;self.wagons=[]
        self.events=[];self.attached=0;self.detached=0;self.charges=0;self.battery=65.-index*4
        self.target_count=cfg.get('trailers',3);self.max_count=0;self.max_tail_error=0.;self.max_loaded_angle=0.
        full=cfg['outbound']+cfg['return'][1:];route=Route(full)
        eligible=[]
        for i in range(1,len(full)-1):
            a,b,c=full[i-1:i+2]
            delta=wrap(math.atan2(c[1]-b[1],c[0]-b[0])-math.atan2(b[1]-a[1],b[0]-a[0]))
            if abs(delta)<.15:eligible.append(i)
        cut1=min(eligible,key=lambda i:abs(route.s[i]-route.s[-1]*.45))
        cut2=min((i for i in eligible if i>cut1),key=lambda i:abs(route.s[i]-route.s[-1]*.76))
        self.routes={'hauling_a':full[:cut1+1],'hauling_b':full[cut1:cut2+1],'return':full[cut2:]}
        self.full=full;self.route=Route(self.routes['hauling_a'])
        self.phase='loading';self.start_time=0.;self.duration=4.+index*2;self.deadline=self.duration
        self.progress=0.;self.pending=0;self.action='等待站内接挂';self.now=0.
        self.others=[]
    def stopped(self):
        return self.speed()<.03 and all(w['body'].GetPosDt().Length()<.03 and w['body'].GetAngVelParent().Length()<.05 for w in self.wagons)
    def coupling_clear(self):
        parent=self.wagons[-1]['body'] if self.wagons else self.base
        anchor=(-.65,0,-.14) if self.wagons else (-.5725,0,-.0525)
        p=point(parent,anchor)-parent.GetRot().Rotate(ch.ChVector3d(.75,0,-.14))
        return all(math.hypot(p.x-b.GetPos().x,p.y-b.GetPos().y)>2.0 for r in self.others if r is not self for b in [r.base]+[w['body'] for w in r.wagons])
    def event(self,kind):
        self.events.append({'time':self.now,'kind':kind,'count':len(self.wagons),'speed':self.speed()})
    def service(self,phase,duration=4.):
        self.phase=phase;self.start_time=self.now;self.duration=duration;self.deadline=self.now+duration
        self.speed_cmd=0.;self.yaw_integral=0.
    def depart(self,phase):
        self.phase=phase;self.route=Route(self.routes[phase]);self.yaw_integral=0.
    def attach(self):
        assert self.stopped(), 'Coupling requires stopped train'
        parent=self.wagons[-1]['body'] if self.wagons else self.base
        offset=(-.65,0,-.14) if self.wagons else (-.5725,0,-.0525)
        hitchpoint=point(parent,offset);q=parent.GetRot()
        center=hitchpoint-q.Rotate(ch.ChVector3d(.75,0,-.14))
        material=ch.ChContactMaterialNSC();material.SetFriction(self.friction)
        def add(body,p):
            body.SetPos(p);body.SetRot(q);body.GetCollisionModel().SetFamily(self.family)
            body.GetCollisionModel().SetFamilyMask(0x7fff & ~(1<<self.family));self.system.Add(body)
            # Runtime insertion must explicitly register with the initialized
            # collision engine (Chrono 10 ChCollisionSystem::BindItem).
            self.system.GetCollisionSystem().BindItem(body);return body
        body=add(ch.ChBodyEasyBox(1.15,.7,.4,31/(1.15*.7*.4),False,True,material),center)
        body.SetName(self.name+f'_wagon_{len(self.wagons)+1}')
        hitch=ch.ChLinkLockRevolute();hitch.Initialize(body,parent,ch.ChFramed(hitchpoint,q));self.system.AddLink(hitch)
        wheels=[];joints=[]
        for y in (-.36,.36):
            wheel=add(ch.ChBodyEasyCylinder(ch.ChAxis_Y,.14,.08,700,False,True,material),center+q.Rotate(ch.ChVector3d(-.15,y,-.18)))
            joint=ch.ChLinkLockRevolute();joint.Initialize(wheel,body,ch.ChFramed(wheel.GetPos(),q*ch.QuatFromAngleX(-math.pi/2)))
            self.system.AddLink(joint);wheels.append(wheel);joints.append(joint)
        self.wagons.append({'body':body,'parent':parent,'anchor':offset,'hitch':hitch,'wheels':wheels,'joints':joints,'serial':self.attached+1})
        self.attached+=1;self.max_count=max(self.max_count,len(self.wagons));self.event('attach')
    def detach(self):
        assert self.stopped(), 'Uncoupling requires stopped train'
        wagon=self.wagons.pop();self.system.RemoveLink(wagon['hitch'])
        for j in wagon['joints']:self.system.RemoveLink(j)
        for w in wagon['wheels']:self.system.RemoveBody(w)
        self.system.RemoveBody(wagon['body']);self.detached+=1;self.event('detach')
    def navigate(self,t):
        self.now=t;self.yielding=False;p=self.position();v=self.speed()
        self.route.project(p.x,p.y);self.max_cte=max(self.max_cte,self.route.error)
        if self.route.error>2.:self.error='车头路线偏差超限'
        if self.error:self.target_speed=0.;self.target_yaw=0.;return
        self.progress=clamp((t-self.start_time)/max(self.duration,.01),0,1)
        if self.phase in ('loading','unloading_a','unloading_b','unloading_home','charging'):
            self.target_speed=0.;self.target_yaw=0.
            if self.phase=='charging':
                self.action='加速充电演示（20 s）'
                self.battery=min(100,self.charge_start+24*self.progress)
                if t>=self.deadline:
                    self.charges+=1;self.event('charge_complete');self.target_count=self.cfg.get('trailers',3)
                    self.service('loading');self.action='站内送挂 / 对接'
            elif t>=self.deadline and self.stopped():
                if self.phase=='loading':
                    if len(self.wagons)<self.target_count:
                        if self.coupling_clear():self.attach();self.service('loading');self.action='站内送挂 / 对接'
                        else:self.action='等待接挂区域清空'
                    else:self.depart('hauling_a')
                else:
                    if self.wagons:self.detach()
                    if self.phase=='unloading_a':self.completed+=1;self.depart('hauling_b')
                    elif self.phase=='unloading_b':self.completed+=1;self.depart('return')
                    elif self.wagons:self.service('unloading_home')
                    else:
                        self.cycles+=1;self.charge_start=self.battery;self.service('charging',20.);self.event('charge_start')
            return
        remaining=self.route.s[-1]-self.route.progress;distance=math.dist((p.x,p.y),self.route.points[-1])
        if remaining<.35 and distance<.4 and v<.03:
            self.stops.append({'time':t,'leg':self.phase,'distance_m':distance,'speed':v})
            dest={'hauling_a':'unloading_a','hauling_b':'unloading_b','return':'unloading_home'}[self.phase]
            self.service(dest);self.action='解除尾挂 / 站内转运';self.target_speed=0.;self.target_yaw=0.;return
        tx,ty=self.route.at(self.route.progress+1.2+v*.7)
        angle=yaw(self.base);dx,dy=tx-p.x,ty-p.y;lateral=-math.sin(angle)*dx+math.cos(angle)*dy
        curvature=2*lateral/max(.3,dx*dx+dy*dy)
        speed=min(self.cfg.get('speed',1.3),math.sqrt(.30/max(abs(curvature),.01)),math.sqrt(max(0,remaining-.18)))
        if remaining<.25:speed=0.
        self.target_speed=speed;self.target_yaw=clamp(speed*curvature,-.5,.5)
        self.action='三节编组转弯验证' if len(self.wagons)==3 else '沿路运输'
    def traffic(self,others):
        self.others=others
        p=self.position();a=yaw(self.base);c,s=math.cos(a),math.sin(a)
        for other in others:
            if other is self:continue
            positions=[b.GetPos() for b in [other.base]+[w['body'] for w in other.wagons]]
            # Reserve the full future three-wagon footprint even while empty.
            # Otherwise attaching a new tail could overlap a queued follower.
            positions.extend(point(other.base,(-1.3225-1.4*k,0,.0875)) for k in range(MAX_TRAILERS))
            for q in positions:
                dx,dy=q.x-p.x,q.y-p.y;forward=c*dx+s*dy;lateral=-s*dx+c*dy
                if 0<forward<9 and abs(lateral)<1.3:
                    allowed=clamp((forward-3.2)*.45,0,1.3)
                    if allowed<self.target_speed:
                        self.target_yaw*=allowed/max(self.target_speed,1e-9);self.target_speed=allowed;self.yielding=True
    def actuate(self,dt):
        super().actuate(dt)
        if self.phase!='charging':self.battery=max(0,self.battery-dt*(.002+self.speed()*.025*(1+.3*len(self.wagons))))
    def state(self):
        v=self.speed();p=self.position();poses=[pose(self.base,(-.1725,0,-.2325))];details=[]
        for i in range(MAX_TRAILERS):
            if i>=len(self.wagons):poses.extend([[0,0,-100,1,0,0,0],[0,0,-100,1,0,0,0]]);continue
            w=self.wagons[i];b=w['body'];parent=w['parent'];q=b.GetRot()
            angle=wrap(yaw(parent)-yaw(b));hitch=(point(parent,w['anchor'])-point(b,(.75,0,-.14))).Length()
            tilt=math.acos(clamp(q.Rotate(ch.ChVector3d(0,0,1)).z,-1,1))
            self.max_hitch=max(self.max_hitch,hitch);self.max_angle=max(self.max_angle,abs(angle));self.max_tilt=max(self.max_tilt,tilt)
            if len(self.wagons)==3:self.max_loaded_angle=max(self.max_loaded_angle,abs(angle))
            if abs(angle)>math.radians(70) or tilt>math.radians(20):self.error='挂车姿态超限'
            details.append({'index':i+1,'id':f"{self.name}-wagon-{w['serial']}",'angle_deg':math.degrees(angle),'hitch_error_m':hitch,'tilt_deg':math.degrees(tilt)})
            poses.extend([pose(b,(0,0,-.14)),pose(b,(0,0,.16))])
        self.max_speed=max(self.max_speed,v)
        labels={'loading':'装挂站 · 接挂','hauling_a':'满挂运输 → 卸挂 A','unloading_a':'卸挂 A · 脱挂',
            'hauling_b':'运输 → 卸挂 B','unloading_b':'卸挂 B · 脱挂','return':'返回装挂/充电站',
            'unloading_home':'回站 · 清空挂车','charging':'一体站 · 充电中'}
        return {'name':self.name,'phase':self.error or ('跟车让行' if self.yielding else labels[self.phase]),'stage':self.phase,
            'completed':self.completed,'cycles':self.cycles,'speed':v,'target_speed':self.target_speed,'x':p.x,'y':p.y,
            'route_error_m':self.route.error,'hitch_error_m':max((x['hitch_error_m'] for x in details),default=0),
            'trailer_angle_deg':max((abs(x['angle_deg']) for x in details),default=0),'trailer_tilt_deg':max((x['tilt_deg'] for x in details),default=0),
            'error':self.error,'poses':poses,'trailer_count':len(self.wagons),'target_count':self.target_count,'wagons':details,
            'battery':self.battery,'service_progress':self.progress,'action':self.action,'attached':self.attached,'detached':self.detached,
            'charges':self.charges,'events':self.events[-5:],'stations':[
                {'name':'装挂 / 充电一体站','point':self.routes['hauling_a'][0][:]},
                {'name':'卸挂 A','point':self.routes['hauling_a'][-1][:]},
                {'name':'卸挂 B','point':self.routes['hauling_b'][-1][:]}]}
    def metrics(self):
        return {**super().metrics(),'max_trailer_count':self.max_count,'attached':self.attached,'detached':self.detached,
            'charges':self.charges,'max_three_wagon_angle_deg':math.degrees(self.max_loaded_angle),'events':self.events}
