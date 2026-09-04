/* ============================================================================
   SOUND
   ----------------------------------------------------------------------------
   Everything is synthesised with WebAudio — no audio files, so the page stays
   a single self-contained document.
   ========================================================================== */

const Sfx = {
  ctx:null, master:null, muted:false, noise:null,
  unlock(){
    if (this.ctx){ if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++){ seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; data[i] = (seed / 2147483648) - 1; }
  },
  tone(freq, dur, type, vol, slideTo){
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol == null ? 0.3 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  burst(dur, vol, lp){
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.setValueAtTime(lp || 2600, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(120, (lp||2600) * 0.25), t + dur);
    g.gain.setValueAtTime(vol == null ? 0.3 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  play(name){
    if (!this.ctx || this.muted) return;
    switch (name){
      case "whiff":  this.burst(0.07, 0.10, 2200); break;
      case "hit":    this.burst(0.09, 0.34, 2000); this.tone(190, 0.07, "square", 0.16, 90); break;
      case "kick":   this.burst(0.10, 0.32, 1500); this.tone(150, 0.08, "square", 0.16, 70); break;
      case "heavy":  this.burst(0.17, 0.46, 1100); this.tone(110, 0.14, "square", 0.24, 45); break;
      case "sweep":  this.burst(0.13, 0.34, 900);  break;
      case "block":  this.burst(0.07, 0.24, 5200); this.tone(760, 0.05, "square", 0.10, 520); break;
      case "fire":   this.tone(340, 0.24, "sawtooth", 0.20, 900); this.burst(0.20, 0.14, 3200); break;
      case "clash":  this.tone(880, 0.20, "square", 0.22, 220); this.burst(0.16, 0.24, 5000); break;
      case "jump":   this.tone(260, 0.10, "square", 0.11, 480); break;
      case "land":   this.burst(0.06, 0.14, 900); break;
      case "thud":   this.burst(0.22, 0.42, 620); this.tone(70, 0.20, "sine", 0.30, 40); break;
      case "throw":  this.burst(0.20, 0.40, 800); this.tone(150, 0.18, "square", 0.24, 60); break;
      case "super":  this.tone(220, 0.5, "sawtooth", 0.22, 1400); this.burst(0.5, 0.16, 4000); break;
      case "ko":     this.tone(300, 0.7, "square", 0.28, 60); this.burst(0.5, 0.24, 900); break;
      case "win":    [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,0.20,"square",0.20),i*110)); break;
      case "select": this.tone(700, 0.05, "square", 0.16, 1100); break;
      case "round":  this.tone(440, 0.16, "square", 0.20, 660); break;
    }
  },
  toggleMute(){ this.muted = !this.muted; return this.muted; }
};
