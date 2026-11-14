class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.playClick();
    }
    return this.muted;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.08,
    delay = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public playStep(): void {
    this.tone(115, 80, 0.045, 'triangle', 0.03);
  }

  public playHit(): void {
    this.tone(180, 65, 0.11, 'sawtooth', 0.08);
    this.tone(95, 50, 0.09, 'square', 0.05, 0.01);
  }

  public playCrit(): void {
    this.tone(320, 110, 0.16, 'sawtooth', 0.11);
    this.tone(620, 440, 0.14, 'triangle', 0.08, 0.02);
  }

  public playPlayerHurt(): void {
    this.tone(130, 52, 0.15, 'square', 0.09);
  }

  public playSpell(): void {
    this.tone(360, 720, 0.18, 'sine', 0.07);
    this.tone(540, 880, 0.22, 'triangle', 0.05, 0.04);
  }

  public playHeal(): void {
    this.tone(392, 523, 0.14, 'sine', 0.06);
    this.tone(523, 659, 0.18, 'sine', 0.06, 0.08);
  }

  public playLoot(): void {
    this.tone(523.25, 523.25, 0.08, 'triangle', 0.07, 0);
    this.tone(659.25, 659.25, 0.09, 'triangle', 0.07, 0.06);
    this.tone(783.99, 1046.5, 0.16, 'sine', 0.08, 0.12);
  }

  public playLevelUp(): void {
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      this.tone(n, n * 1.02, 0.18, 'triangle', 0.08, idx * 0.08);
    });
  }

  public playQuill(): void {
    this.tone(420, 320, 0.035, 'sine', 0.035);
  }

  public playClick(): void {
    this.tone(480, 400, 0.04, 'sine', 0.04);
  }

  public playDoor(): void {
    this.tone(140, 210, 0.14, 'triangle', 0.06);
  }

  public playWaystone(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      this.tone(freq, freq * 1.03, 0.22, 'sine', 0.065, idx * 0.07);
    });
  }

  public playForge(): void {
    this.tone(920, 620, 0.09, 'triangle', 0.09, 0);
    this.tone(1240, 740, 0.18, 'sine', 0.06, 0.02);
    this.tone(180, 95, 0.14, 'sawtooth', 0.05, 0.06);
  }

  public playTrap(): void {
    this.tone(420, 120, 0.09, 'square', 0.08, 0);
    this.tone(140, 58, 0.15, 'sawtooth', 0.08, 0.04);
  }

  public playBossRoar(): void {
    this.tone(130, 72, 0.28, 'sawtooth', 0.08, 0);
    this.tone(195, 98, 0.3, 'triangle', 0.07, 0.05);
  }

  public playFrost(): void {
    this.tone(760, 1120, 0.16, 'sine', 0.06, 0);
    this.tone(540, 380, 0.2, 'triangle', 0.05, 0.04);
  }

  public playEmber(): void {
    this.tone(240, 580, 0.14, 'sawtooth', 0.06, 0);
    this.tone(460, 210, 0.18, 'triangle', 0.06, 0.05);
  }

  public playHazard(): void {
    this.tone(280, 140, 0.11, 'sawtooth', 0.06, 0);
    this.tone(180, 90, 0.14, 'triangle', 0.05, 0.04);
  }

  public playCompanion(): void {
    this.tone(540, 780, 0.08, 'triangle', 0.05, 0);
    this.tone(720, 960, 0.1, 'sine', 0.04, 0.03);
  }

  public playRuneforge(): void {
    this.tone(840, 580, 0.1, 'triangle', 0.075, 0);
    this.tone(1120, 1420, 0.2, 'sine', 0.06, 0.05);
  }

  public playCodexUnlock(): void {
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      this.tone(freq, freq, 0.16, 'triangle', 0.06, idx * 0.06);
    });
  }
}

export const soundEngine = new SoundEngine();
