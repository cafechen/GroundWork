"""Five torque-driven articulated tuggers in ONE Chrono contact system.

No pose/velocity assignment after initialization. Rigid wheel model, uncalibrated.
Road geometry is a navigation reference, not a Chrono obstacle mesh.
"""
import argparse
import json
import math
from pathlib import Path
import socket
import struct
import sys
import time
import uuid
import pychrono.core as ch

HERE=Path(__file__).resolve().parent
VERSION=json.loads(next((Path(sys.prefix)/'conda-meta').glob('pychrono-*.json')).read_text())['version']
def clamp(x,a,b):return max(a,min(b,x))
def wrap(x):return math.atan2(math.sin(x),math.cos(x))
def yaw(body):
    q=body.GetRot();return math.atan2(2*(q.e0*q.e3+q.e1*q.e2),1-2*(q.e2*q.e2+q.e3*q.e3))
def point(body,xyz):return body.GetPos()+body.GetRot().Rotate(ch.ChVector3d(*xyz))
def pose(body,offset=(0,0,0)):
    p=point(body,offset);q=body.GetRot();return [p.x,p.y,p.z,q.e0,q.e1,q.e2,q.e3]

class Route:
    def __init__(self,points):
        self.points=points;self.s=[0.]
        for a,b in zip(points,points[1:]):self.s.append(self.s[-1]+math.dist(a,b))
        self.progress=0.;self.segment=0;self.error=0.
    def project(self,x,y):
        choices=[]
        for i in range(max(0,self.segment-1),min(len(self.points)-1,self.segment+5)):
            a,b=self.points[i:i+2];dx,dy=b[0]-a[0],b[1]-a[1];l2=dx*dx+dy*dy
            u=clamp(((x-a[0])*dx+(y-a[1])*dy)/l2,0,1) if l2 else 0
            e=math.hypot(x-a[0]-u*dx,y-a[1]-u*dy)
            choices.append((e,i,self.s[i]+u*math.sqrt(l2)))
        self.error,i,s=min(choices)
        self.segment=max(self.segment,i);self.progress=max(self.progress,s)
    def at(self,s):
        for i in range(len(self.s)-1):
            if self.s[i+1]>=s:
                u=clamp((s-self.s[i])/max(1e-9,self.s[i+1]-self.s[i]),0,1)
                a,b=self.points[i:i+2];return (a[0]+u*(b[0]-a[0]),a[1]+u*(b[1]-a[1]))
        return self.points[-1]

class Tugger:
    def __init__(self,system,cfg,index,friction):
        self.cfg=cfg;self.name=cfg['name'];self.motors=[]
        self.trailer_wheels=[];self.trailer_joints=[]
        self.phase='loading';self.deadline=3.+index*2.;self.completed=0;self.cycles=0
        self.route=Route(cfg['outbound']);self.error='';self.yielding=False
        self.speed_cmd=0.;self.yaw_integral=0.;self.target_speed=0.;self.target_yaw=0.
        self.max_cte=0.;self.max_hitch=0.;self.max_angle=0.;self.max_tilt=0.
        self.max_speed=0.;self.stops=[];self.last_arrival_error=0.
        origin=ch.ChVector3d(*cfg['spawn'][:3]);rotation=ch.QuatFromAngleZ(cfg['spawn'][5])
        def world(xyz):return origin+rotation.Rotate(ch.ChVector3d(*xyz))
        mat=ch.ChContactMaterialNSC();mat.SetFriction(friction)
        front=ch.ChContactMaterialNSC();front.SetFriction(friction*.15)
        def add(body,xyz):
            body.SetPos(world(xyz));body.SetRot(rotation)
            body.GetCollisionModel().SetFamily(index+1)
            body.GetCollisionModel().SetFamilyMask(0x7fff & ~(1<<(index+1)))
            system.Add(body);return body
        def box(label,size,mass,xyz):
            b=ch.ChBodyEasyBox(*size,mass/math.prod(size),False,True,mat)
            b.SetName(self.name+'_'+label);return add(b,xyz)
        self.base=box('chassis',(.75,.465,.24),40,(.1725,0,.2325))
        # Fixed cargo mass is part of this rigid loaded body; no instantaneous
        # mass changes or kinematic repositioning at loading stations.
        self.trailer=box('loaded_trailer',(1.15,.7,.40),31,(-1.15,0,.32))
        self.hitch=ch.ChLinkLockRevolute()
        self.hitch.Initialize(self.trailer,self.base,ch.ChFramed(world((-.4,0,.18)),rotation));system.AddLink(self.hitch)
        axis=rotation*ch.QuatFromAngleX(-math.pi/2)
        for x in (-.1125,.4275):
            for y in (-.24,.24):
                w=add(ch.ChBodyEasyCylinder(ch.ChAxis_Y,.1125,.0675,900,False,True,front if x>0 else mat),(x,y,.1125))
                motor=ch.ChLinkMotorRotationTorque();motor.Initialize(w,self.base,ch.ChFramed(w.GetPos(),axis))
                f=ch.ChFunctionConst(0);motor.SetTorqueFunction(f);system.AddLink(motor)
                self.motors.append((motor,f,y))
        for y in (-.36,.36):
            w=add(ch.ChBodyEasyCylinder(ch.ChAxis_Y,.14,.08,700,False,True,mat),(-1.3,y,.14))
            joint=ch.ChLinkLockRevolute();joint.Initialize(w,self.trailer,ch.ChFramed(w.GetPos(),axis));system.AddLink(joint)
            self.trailer_wheels.append(w);self.trailer_joints.append(joint)
    def position(self):return point(self.base,(-.1725,0,-.2325))
    def speed(self):
        v=self.base.GetPosDt();return math.hypot(v.x,v.y)
    def navigate(self,t):
        p=self.position();v=self.speed();self.yielding=False
        self.route.project(p.x,p.y);self.max_cte=max(self.max_cte,self.route.error)
        if self.route.error>2.:self.error='路线偏差超过 2 m'
        if self.error:self.target_speed=0.;self.target_yaw=0.;return
        if self.phase in ('loading','unloading'):
            self.target_speed=0.;self.target_yaw=0.
            if t>=self.deadline:
                self.phase='outbound' if self.phase=='loading' else 'return'
                self.route=Route(self.cfg[self.phase])
            return
        remaining=self.route.s[-1]-self.route.progress
        distance=math.dist((p.x,p.y),self.route.points[-1])
        if remaining<.35 and distance<.4 and v<.10:
            self.last_arrival_error=distance
            self.stops.append({'time':t,'leg':self.phase,'distance_m':distance,'speed':v})
            if self.phase=='outbound':self.completed+=1;self.phase='unloading'
            else:self.cycles+=1;self.phase='loading'
            self.deadline=t+3.;self.target_speed=0.;self.target_yaw=0.;return
        lookahead=1.2+v*.7
        tx,ty=self.route.at(self.route.progress+lookahead)
        heading=yaw(self.base);dx,dy=tx-p.x,ty-p.y
        lateral=-math.sin(heading)*dx+math.cos(heading)*dy
        curvature=2*lateral/max(.3,dx*dx+dy*dy)
        speed=min(1.5,math.sqrt(.45/max(abs(curvature),.01)),math.sqrt(max(0,1.0*(remaining-.18))))
        if remaining<.25:speed=0.
        self.target_speed=speed;self.target_yaw=clamp(speed*curvature,-.6,.6)
    def traffic(self,others):
        p=self.position();heading=yaw(self.base);c,s=math.cos(heading),math.sin(heading)
        for other in others:
            if other is self:continue
            for body in (other.base,other.trailer):
                q=body.GetPos();dx,dy=q.x-p.x,q.y-p.y
                forward=c*dx+s*dy;lateral=-s*dx+c*dy
                if 0<forward<8 and abs(lateral)<1.25:
                    allowed=clamp((forward-3.0)*.5,0,1.5)
                    if allowed<self.target_speed:
                        ratio=allowed/max(self.target_speed,1e-9)
                        self.target_speed=allowed;self.target_yaw*=ratio;self.yielding=True
    def actuate(self,dt):
        self.speed_cmd+=clamp(self.target_speed-self.speed_cmd,-.8*dt,.45*dt)
        desired=self.target_yaw if self.speed_cmd>.08 else 0.
        error=desired-self.base.GetAngVelParent().z
        self.yaw_integral=clamp(self.yaw_integral+error*dt,-.10,.10)
        effort=80*error+35*self.yaw_integral
        for motor,f,y in self.motors:
            target=(self.speed_cmd-desired*y)/.1125
            f.SetConstant(clamp(1.8*(target-motor.GetMotorAngleDt())-math.copysign(1,y)*effort,-15,15))
    def state(self):
        p=self.position();v=self.speed();q=self.trailer.GetRot()
        angle=wrap(yaw(self.base)-yaw(self.trailer))
        a=point(self.base,(-.5725,0,-.0525));b=point(self.trailer,(.75,0,-.14))
        hitch=(a-b).Length();up=q.Rotate(ch.ChVector3d(0,0,1));tilt=math.acos(clamp(up.z,-1,1))
        self.max_hitch=max(self.max_hitch,hitch);self.max_angle=max(self.max_angle,abs(angle));self.max_tilt=max(self.max_tilt,tilt);self.max_speed=max(self.max_speed,v)
        if abs(angle)>math.radians(70) or tilt>math.radians(20):self.error='挂车姿态超限'
        labels={'loading':'装货等待','outbound':'驶向卸货点','unloading':'卸货等待','return':'返回装货点'}
        return {'name':self.name,'phase':self.error or ('跟车让行' if self.yielding else labels[self.phase]),
            'stage':self.phase,'completed':self.completed,'cycles':self.cycles,'speed':v,'target_speed':self.target_speed,
            'x':p.x,'y':p.y,'route_error_m':self.route.error,'hitch_error_m':hitch,'trailer_angle_deg':math.degrees(angle),
            'trailer_tilt_deg':math.degrees(tilt),'error':self.error,'poses':[pose(self.base,(-.1725,0,-.2325)),pose(self.trailer,(0,0,-.14)),pose(self.trailer,(0,0,.16))]}
    def metrics(self):return {'name':self.name,'completed':self.completed,'cycles':self.cycles,'max_route_error_m':self.max_cte,
        'max_hitch_error_m':self.max_hitch,'max_trailer_angle_deg':math.degrees(self.max_angle),
        'max_trailer_tilt_deg':math.degrees(self.max_tilt),'max_speed':self.max_speed,'stops':self.stops,'error':self.error}

def main():
    p=argparse.ArgumentParser();p.add_argument('--offline-seconds',type=float,default=0);p.add_argument('--friction',type=float,default=.8)
    p.add_argument('--scene',type=Path,default=HERE/'runtime/scene.json');p.add_argument('--output',type=Path)
    args=p.parse_args();scene=json.loads(args.scene.read_text());assert 1<=len(scene['robots'])<=5
    runtime=args.output or (HERE/'runtime/offline' if args.offline_seconds else HERE/'runtime');runtime.mkdir(parents=True,exist_ok=True)
    system=ch.ChSystemNSC();system.SetGravitationalAcceleration(ch.ChVector3d(0,0,-9.81))
    system.SetCollisionSystemType(ch.ChCollisionSystem.Type_BULLET);system.GetSolver().AsIterative().SetMaxIterations(100)
    mat=ch.ChContactMaterialNSC();mat.SetFriction(args.friction)
    # Local origin and bounded contact floor avoid unnecessarily large Bullet
    # coordinates/shapes; exported poses remain in the original map frame.
    origin=tuple(scene.get('origin',[0.,0.]))
    for cfg in scene['robots']:
        cfg['spawn'][0]-=origin[0];cfg['spawn'][1]-=origin[1]
        for leg in ('outbound','return'):
            cfg[leg]=[[p[0]-origin[0],p[1]-origin[1]] for p in cfg[leg]]
    floor=ch.ChBodyEasyBox(200,200,.2,1000,False,True,mat);floor.SetPos(ch.ChVector3d(0,0,-.1));floor.SetFixed(True);system.Add(floor)
    vehicle_type=Tugger
    if scene.get('mode')=='train':
        from train import TrainTugger
        vehicle_type=TrainTugger
    robots=[vehicle_type(system,cfg,i,args.friction) for i,cfg in enumerate(scene['robots'])]
    sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    if not args.offline_seconds:sock.bind(('127.0.0.1',23120))
    seq=0;last_request=0;cached=b'';started=time.monotonic();run=uuid.uuid4().hex[:12]
    journal=(runtime/'chrono.jsonl').open('w',buffering=1)
    print('Chrono',VERSION,len(robots),'articulated tuggers ready',flush=True)
    while True:
        if args.offline_seconds:
            if system.GetChTime()>=args.offline_seconds:break
            seq+=1;dt=.02
        else:
            packet,peer=sock.recvfrom(1024)
            if len(packet)!=16:continue
            request,dt=struct.unpack('<2d',packet)
            if request==last_request and cached:sock.sendto(cached,peer);continue
            if request!=last_request+1 or not 0<dt<=.1:continue
            seq=int(request);last_request=seq
        t=system.GetChTime()
        for r in robots:r.navigate(t)
        for r in robots:r.traffic(robots)
        steps=max(1,math.ceil(dt/.002));step=dt/steps
        for _ in range(steps):
            for r in robots:r.actuate(step)
            system.DoStepDynamics(step)
        states=[r.state() for r in robots];t=system.GetChTime()
        for state in states:
            state['x']+=origin[0];state['y']+=origin[1]
            for values in state['poses']:values[0]+=origin[0];values[1]+=origin[1]
            for station in state.get('stations',[]):station['point'][0]+=origin[0];station['point'][1]+=origin[1]
        row={'run':run,'seq':seq,'time':t,'wall_elapsed':time.monotonic()-started,'robots':states,
             'contacts':system.GetNumContacts(),'chrono_version':VERSION,'friction':args.friction,'map':scene['map']}
        journal.write(json.dumps(row,ensure_ascii=False)+'\n')
        if seq%10==0:
            temp=runtime/'state.tmp';temp.write_text(json.dumps(row,ensure_ascii=False));temp.replace(runtime/'state.json')
        if not args.offline_seconds:
            values=[v for r in states for pose_values in r['poses'] for v in pose_values]
            cached=struct.pack(f'<{2+len(values)}d',seq,t,*values);sock.sendto(cached,peer)
        if seq%1000==0:print('t=',round(t),[(r.name,r.phase,r.completed,r.cycles,r.error) for r in robots],flush=True)
    summary={'seconds':system.GetChTime(),'wall_seconds':time.monotonic()-started,'robots':[r.metrics() for r in robots]}
    (runtime/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
