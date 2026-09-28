"""Manage ONLY the GroundWork preview process, with PID identity checks.

No systemd installation, reboot autostart or changes to existing robot services.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

base = Path(os.environ.get('GROUNDWORK_HOME', '/home/steven/src/groundwork')).resolve()
record = base / 'service.json'

def current():
    if not record.exists():
        return None
    state = json.loads(record.read_text())
    proc = Path('/proc') / str(state['pid']) / 'cmdline'
    if not proc.exists():
        return None
    args = proc.read_bytes().split(b'\0')
    if str(base / '.tools/node/bin/node').encode() not in args or state['script'].encode() not in args:
        raise RuntimeError('PID identity mismatch: refusing to touch this process')
    return state

def stop():
    state = current()
    if not state:
        print('GroundWork is not running')
        return
    os.kill(state['pid'], signal.SIGTERM)
    for _ in range(100):
        proc = Path('/proc') / str(state['pid'])
        if not proc.exists() or ') Z ' in (proc/'stat').read_text():
            print('Stopped GroundWork', state['pid'])
            return
        time.sleep(.1)
    raise RuntimeError('GroundWork did not stop in 10 s; inspect before restarting')

def start():
    state = current()
    if state:
        print('Already running', json.dumps(state))
        return
    release = (base / 'current').resolve(strict=True)
    if release.parent != base / 'releases':
        raise RuntimeError('Current release must live in groundwork/releases')
    script = release / 'scripts/serve.mjs'
    env = dict(os.environ, HOST='0.0.0.0', PORT='5180',
        GROUNDWORK_ALLOWED_HOSTS='robots,steven-omen-3070,10.1.153.185,10.9.0.20',
        GROUNDWORK_DATA=str(base/'data/runs'),
        GROUNDWORK_CHRONO_PYTHON=str(base/'.venv-chrono/bin/python'))
    with (base/'server.log').open('ab') as log:
        child = subprocess.Popen([str(base/'.tools/node/bin/node'), str(script)], cwd=release,
            env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    time.sleep(1)
    if child.poll() is not None:
        raise RuntimeError('Startup failed; inspect GroundWork server.log')
    state = {'pid':child.pid,'script':str(script),'release':str(release),'port':5180}
    record.write_text(json.dumps(state,indent=2))
    print(json.dumps(state))

if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv)>1 else 'status'
    if action == 'start': start()
    elif action == 'stop': stop()
    elif action == 'restart': stop(); start()
    elif action == 'status': print(json.dumps(current()))
    else: raise SystemExit('Use start | stop | restart | status')
