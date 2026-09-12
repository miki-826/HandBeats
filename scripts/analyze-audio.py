"""Offline PCM analysis: spectral flux, tempo/phase grid, and energy sections.
Uses numpy only. Generated measurements are reviewed before chart authoring.
"""
import json
from pathlib import Path
import numpy as np

results=[]
for source in json.loads(Path('.analysis/sources.json').read_text(encoding='utf8')):
    y=np.fromfile('.analysis/'+source['id']+'.f32',dtype='<f4')
    sr=16000; hop=160; nfft=1024
    frames=np.lib.stride_tricks.sliding_window_view(y,nfft)[::hop]
    spec=np.abs(np.fft.rfft(frames*np.hanning(nfft),axis=1))
    # Log spectral flux weights attacks over sustained vocals.
    log=np.log1p(spec*10)
    flux=np.maximum(np.diff(log,axis=0),0).mean(axis=1)
    flux=np.concatenate([[0],flux]); flux=np.maximum(0,flux-np.convolve(flux,np.ones(101)/101,'same'))
    t=(np.arange(len(flux))*hop+nfft/2)/sr
    candidates=[]
    for bpm in np.arange(75,180,.1):
        period=60/bpm
        phases=np.linspace(0,period,96,endpoint=False)
        strengths=[]
        for phase in phases:
            grid=np.arange(phase,min(len(y)/sr-1,110),period)
            strengths.append(float(np.mean(np.interp(grid,t,flux))))
        best=int(np.argmax(strengths))
        candidates.append((max(strengths),float(bpm),float(phases[best])))
    candidates.sort(reverse=True)
    peaks=[]
    for strength,bpm,phase in candidates:
        if all(abs(bpm-p['bpm'])>2 for p in peaks):
            peaks.append({'bpm':round(bpm,2),'phaseMs':round(phase*1000),'strength':round(strength,5)})
        if len(peaks)==6: break
    windows=[]
    for start in range(0,int(len(y)/sr),4):
        a=y[start*sr:(start+4)*sr]
        windows.append({'startMs':start*1000,'rms':round(float(np.sqrt(np.mean(a*a))),4),'onset':round(float(np.mean(flux[(t>=start)&(t<start+4)])),4)})
    result={**{k:v for k,v in source.items() if k!='probe'},'durationMs':round(len(y)*1000/sr),'tempoCandidates':peaks,'energyWindows':windows}
    results.append(result)
    np.savez('.analysis/'+source['id']+'-features.npz',t=t,flux=flux,spec=spec)
    print(source['title'],result['durationMs'],peaks)
Path('.analysis/measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
