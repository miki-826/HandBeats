"""One-time, offline chart authoring from measured attacks. NOT a runtime generator.
Existing chart versions are immutable: use a new version for any edits.
"""
import json, hashlib
from pathlib import Path
import numpy as np

specs=[
    (95,79,'#e9ad78','朝の一歩を、軽やかなリズムに。', [2,4,7]),
    (127,74,'#d7ed80','はじけるビート。手拍子で笑顔満開。',[3,6,8]),
    (72,70,'#9dbbea','深呼吸するように、ゆったり刻もう。',[1,3,6]),
    (172,62,'#e998ab','自分らしさを鳴らす、力強いビート。',[3,6,9]),
]
measurements=json.loads(Path('.analysis/measurements.json').read_text(encoding='utf8'))
lock_path=Path('src/data/chart-lock.json')
lock=json.loads(lock_path.read_text()) if lock_path.exists() else {}
reports=[]
for song_index,(measurement,spec) in enumerate(zip(measurements,specs)):
    bpm,phase,color,mood,levels=spec
    features=np.load('.analysis/'+measurement['id']+'-features.npz')
    times=features['t'];flux=features['flux']
    duration=measurement['durationMs'];period=60000/bpm
    windows=measurement['energyWindows']
    energies=np.array([w['rms'] for w in windows]);threshold=np.quantile(energies,.62)
    sections=[]
    # Energy labels are measured arrangement regions, not invented verse timestamps.
    for w in windows:
        label='peak' if w['rms']>=threshold else 'quiet' if w['rms']<np.quantile(energies,.22) else 'groove'
        if sections and sections[-1]['kind']==label:sections[-1]['endMs']=min(duration,w['startMs']+4000)
        else:sections.append({'startMs':w['startMs'],'endMs':min(duration,w['startMs']+4000),'kind':label})
    folder=Path('src/data/songs')/measurement['id'];folder.mkdir(parents=True,exist_ok=True)
    metadata={ 'id':measurement['id'],'title':measurement['title'],'artist':'Hand Beat Originals','bpm':bpm,'durationMs':duration,'audio':f"/assets/songs/{measurement['id']}/audio.m4a",'jacket':f"/assets/songs/{measurement['id']}/jacket.webp",'previewStartMs':next((s['startMs'] for s in sections if s['kind']=='peak' and s['startMs']>=20000),16000),'color':color,'mood':mood,'difficulties':{} }
    for di,difficulty in enumerate(['easy','normal','hard']):
        notes=[];last_gesture=None
        positions=[(.38,.52),(.61,.47),(.42,.37),(.62,.59)] if di==0 else [(.27,.56),(.72,.43),(.36,.31),(.65,.64),(.28,.38),(.73,.57)] if di==1 else [(.23,.57),(.77,.35),(.31,.29),(.69,.65),(.23,.36),(.76,.58)]
        # Per-song phrases rotate orchestrated kick/snare/hat patterns; never random.
        phrases=[['fist','gun','open','gun'],['fist','open','gun','open'],['open','fist','gun','open'],['fist','gun','fist','open']]
        for beat in range(int((duration-phase)/period)):
            grid=phase+beat*period
            if grid<max(2300,4*period) or grid>duration-1800:continue
            section=next(s for s in sections if s['startMs']<=grid<s['endMs'])
            peak=section['kind']=='peak';quiet=section['kind']=='quiet'
            if di==0 and beat%2:continue
            if di==0 and quiet and beat%4:continue
            if di==1 and quiet and beat%2:continue
            if di==1 and bpm>155 and not peak and beat%2:continue
            if di==2 and quiet and beat%2:continue
            offsets=[0]
            if di==1 and peak and bpm<140 and beat%8==6:offsets.append(.5)
            if di==2 and peak and bpm<=140 and beat%4 in [2,3]:offsets.append(.5)
            for sub in offsets:
                target=(grid+sub*period)/1000
                # Snap to measured onset within 45ms. Keep authored beat when no strong attack.
                indices=np.where((times>=target-.045)&(times<=target+.045))[0]
                best=indices[np.argmax(flux[indices])] if len(indices) else None
                when=round(float(times[best])*1000) if best is not None and flux[best]>np.quantile(flux,.65) else round(target*1000)
                if notes and when-notes[-1]['timeMs']<180:continue
                phrase=phrases[(beat//16+song_index)%len(phrases)]
                gesture='open' if sub else phrase[(beat//2 if di==0 else beat)%4]
                # Rare, central clap accents, with time to separate hands again.
                if not sub and (beat%(32 if di==0 else 16 if di==1 else 8)==(30 if di==0 else 14 if di==1 else 6)) and not quiet:gesture='clap'
                if gesture==last_gesture:gesture='open' if gesture!='open' else 'gun'
                x,y=(.5,.53) if gesture=='clap' else positions[len(notes)%len(positions)]
                # Eighth-note switches stay within reach of the preceding note.
                if sub and notes:x,y=notes[-1]['x'],notes[-1]['y']
                notes.append({'id':f'n{len(notes)+1:04d}','timeMs':when,'gesture':gesture,'x':x,'y':y})
                last_gesture=gesture
        chart={'songId':measurement['id'],'difficulty':difficulty,'chartVersion':1,'level':levels[di],'durationMs':duration,'offsetMs':0,'notes':notes}
        raw=json.dumps(chart,ensure_ascii=False,indent=2)+'\n';digest=hashlib.sha256(raw.encode()).hexdigest();key=f"{measurement['id']}:{difficulty}:1"
        if key in lock and lock[key]!=digest:raise RuntimeError('Refusing to overwrite published chart '+key+'; bump chartVersion')
        (folder/(difficulty+'.json')).write_bytes(raw.encode());lock[key]=digest
        metadata['difficulties'][difficulty]={'level':levels[di],'chartVersion':1,'noteCount':len(notes)}
    (folder/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    reports.append({**measurement,'selectedBpm':bpm,'gridPhaseMs':phase,'sections':sections,'charts':metadata['difficulties']})
    print(measurement['id'],bpm,metadata['difficulties'])
lock_path.write_text(json.dumps(lock,indent=2)+'\n')
Path('docs').mkdir(exist_ok=True)
Path('docs/audio-analysis.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
