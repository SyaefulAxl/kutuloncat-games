import Phaser from 'phaser';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

export class HangmanScene extends Phaser.Scene {
  private phrase = 'CIE YANG JOMBLO';
  private hint = 'romantis';
  private used = new Set<string>();
  private wrong = 0;
  private done = false;
  private sessionCtx: {
    sessionId?: string;
    startedAt?: number;
    token?: string;
  } | null = null;

  private phraseText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private wrongText!: Phaser.GameObjects.Text;
  private restartBtn!: Phaser.GameObjects.Text;
  private letterBtns: Phaser.GameObjects.Text[] = [];
  private hangmanGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'HangmanScene' });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const m = w < 500; // mobile flag
    const s = m ? w / 500 : 1; // proportional scale

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0b1220, 0x0b1220, 0x101c30, 0x101c30, 1);
    bg.fillRect(0, 0, w, h);

    // Hangman drawing area
    this.hangmanGfx = this.add.graphics();
    this.drawHangmanBase();

    // Status
    this.statusText = this.add
      .text(w / 2, Math.round(14 * s), 'Memulai game...', {
        fontSize: `${Math.max(12, Math.round(16 * s))}px`,
        color: '#9fb0d8',
        fontFamily: 'system-ui',
        align: 'center',
        wordWrap: { width: w - 20 },
      })
      .setOrigin(0.5, 0);

    // Hint
    this.hintText = this.add
      .text(w / 2, Math.round(36 * s), '', {
        fontSize: `${Math.max(11, Math.round(14 * s))}px`,
        color: '#c8d7ff',
        fontFamily: 'system-ui',
        align: 'center',
      })
      .setOrigin(0.5, 0);

    // Phrase display
    const phraseFont = Math.max(16, Math.round(28 * s));
    this.phraseText = this.add
      .text(w / 2, m ? h * 0.3 : h * 0.36, '', {
        fontSize: `${phraseFont}px`,
        color: '#e8eefc',
        fontFamily: 'monospace',
        align: 'center',
        letterSpacing: m ? 2 : 4,
        wordWrap: { width: w - 24 },
        lineSpacing: m ? 4 : 8,
      })
      .setOrigin(0.5);

    // Wrong count
    this.wrongText = this.add
      .text(w / 2, m ? h * 0.42 : h * 0.48, '', {
        fontSize: `${Math.max(10, Math.round(13 * s))}px`,
        color: '#9fb0d8',
        fontFamily: 'system-ui',
        align: 'center',
        wordWrap: { width: w - 20 },
      })
      .setOrigin(0.5);

    // Restart button
    this.restartBtn = this.add
      .text(w / 2, h - Math.round(24 * s), '🔁 Kata Baru', {
        fontSize: `${Math.max(13, Math.round(16 * s))}px`,
        color: '#fff',
        fontFamily: 'system-ui',
        backgroundColor: '#1b3d80',
        padding: { x: Math.round(18 * s), y: Math.round(8 * s) },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.loadNewPhrase())
      .on('pointerover', () =>
        this.restartBtn.setStyle({ backgroundColor: '#2450a5' }),
      )
      .on('pointerout', () =>
        this.restartBtn.setStyle({ backgroundColor: '#1b3d80' }),
      );

    this.loadNewPhrase();
  }

  /* ── Hangman gallows ── */
  private drawHangmanBase() {
    const gfx = this.hangmanGfx;
    const w = this.scale.width;
    const m = w < 500;
    const sc = m ? w / 700 : 1;
    const bx = m ? w / 2 : w - 140;
    const by = m ? 55 : 80;

    gfx.clear();
    gfx.lineStyle(Math.max(2, Math.round(3 * sc)), 0x33486f);
    gfx.strokeLineShape(
      new Phaser.Geom.Line(
        bx - 38 * sc,
        by + 95 * sc,
        bx + 38 * sc,
        by + 95 * sc,
      ),
    );
    gfx.strokeLineShape(new Phaser.Geom.Line(bx, by + 95 * sc, bx, by));
    gfx.strokeLineShape(new Phaser.Geom.Line(bx, by, bx - 38 * sc, by));
    gfx.strokeLineShape(
      new Phaser.Geom.Line(bx - 38 * sc, by, bx - 38 * sc, by + 14 * sc),
    );
  }

  private drawHangmanPart(part: number) {
    const gfx = this.hangmanGfx;
    const w = this.scale.width;
    const m = w < 500;
    const sc = m ? w / 700 : 1;
    const bx = m ? w / 2 - 38 * sc : w - 190;
    const by = m ? 69 : 100;

    gfx.lineStyle(Math.max(2, Math.round(3 * sc)), 0xff6b6b);

    switch (part) {
      case 1:
        gfx.strokeCircle(bx, by + 10 * sc, 9 * sc);
        break;
      case 2:
        gfx.strokeLineShape(
          new Phaser.Geom.Line(bx, by + 19 * sc, bx, by + 50 * sc),
        );
        break;
      case 3:
        gfx.strokeLineShape(
          new Phaser.Geom.Line(bx, by + 28 * sc, bx - 14 * sc, by + 42 * sc),
        );
        break;
      case 4:
        gfx.strokeLineShape(
          new Phaser.Geom.Line(bx, by + 28 * sc, bx + 14 * sc, by + 42 * sc),
        );
        break;
      case 5:
        gfx.strokeLineShape(
          new Phaser.Geom.Line(bx, by + 50 * sc, bx - 13 * sc, by + 68 * sc),
        );
        break;
      case 6:
        gfx.strokeLineShape(
          new Phaser.Geom.Line(bx, by + 50 * sc, bx + 13 * sc, by + 68 * sc),
        );
        break;
    }
  }

  /* ── Phrase loading ── */
  private async loadNewPhrase() {
    this.sessionCtx = null;
    try {
      const r = await fetch('/api/hangman/phrase');
      const j = await r.json();
      if (j?.ok && j?.row?.phrase) {
        this.phrase = this.normalizePhrase(j.row.phrase);
        this.hint = String(j.row.hint || 'umum')
          .toLowerCase()
          .split(/\s+/)[0];
      }
    } catch {
      /* use default */
    }
    this.resetGame();
  }

  private normalizePhrase(p: string): string {
    return String(p || '')
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resetGame() {
    this.used.clear();
    this.wrong = 0;
    this.done = false;
    this.hangmanGfx.clear();
    this.drawHangmanBase();
    this.updateDisplay();
    this.createLetterButtons();
    this.statusText.setText('Game dimulai. Tebak kalimat 3-5 kata ini!');
    this.statusText.setColor('#4ade80');
  }

  private masked(): string {
    return this.phrase
      .split(' ')
      .map((word) =>
        word
          .split('')
          .map((ch) => (this.used.has(ch.toLowerCase()) ? ch : '_'))
          .join(' '),
      )
      .join('   ');
  }

  private updateDisplay() {
    this.phraseText.setText(this.masked());
    this.hintText.setText(`Hint: ${this.hint}`);
    this.wrongText.setText(
      `Kesalahan: ${this.wrong}/6  •  Huruf: ${this.used.size ? [...this.used].join(', ') : '-'}`,
    );
  }

  /* ── Letter buttons — responsive grid ── */
  private createLetterButtons() {
    this.letterBtns.forEach((b) => b.destroy());
    this.letterBtns = [];

    const uniq = [
      ...new Set(this.phrase.toLowerCase().replace(/\s/g, '').split('')),
    ];
    const decoy = [...ALPHA]
      .filter((c) => !uniq.includes(c))
      .sort(() => Math.random() - 0.5)
      .slice(0, 10);
    const letters = [...new Set([...uniq, ...decoy])].sort(
      () => Math.random() - 0.5,
    );

    const w = this.scale.width;
    const h = this.scale.height;
    const m = w < 500;

    const btnW = m ? Math.max(30, Math.floor((w - 30) / 9 - 3)) : 40;
    const btnH = m ? btnW : 40;
    const gap = m ? 3 : 6;
    const fontSize = m ? Math.max(13, btnW - 16) : 18;

    const maxWidth = w - 16;
    const cols = Math.floor((maxWidth + gap) / (btnW + gap));
    const startY = m ? h * 0.48 : h * 0.56;
    const usedCols = Math.min(cols, letters.length);
    const totalW = usedCols * (btnW + gap) - gap;
    const startX = (w - totalW) / 2;

    letters.forEach((ch, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnW + gap) + btnW / 2;
      const y = startY + row * (btnH + gap) + btnH / 2;

      // Don't render if off-screen
      if (y + btnH / 2 > h - 50) return;

      const btn = this.add
        .text(x, y, ch.toUpperCase(), {
          fontSize: `${fontSize}px`,
          fontFamily: 'system-ui',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: '#132341',
          padding: {
            x: Math.round((btnW - fontSize * 0.6) / 2),
            y: Math.round((btnH - fontSize * 1.2) / 2),
          },
          align: 'center',
          fixedWidth: btnW,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.pressLetter(ch, btn))
        .on('pointerover', () => {
          if (!this.used.has(ch) && !this.done)
            btn.setStyle({ backgroundColor: '#1e3a6e' });
        })
        .on('pointerout', () => {
          if (!this.used.has(ch) && !this.done)
            btn.setStyle({ backgroundColor: '#132341' });
        });

      this.letterBtns.push(btn);
    });
  }

  private pressLetter(ch: string, btn: Phaser.GameObjects.Text) {
    if (this.done || this.used.has(ch)) return;
    this.used.add(ch);
    btn.setAlpha(0.35);
    btn.removeInteractive();

    if (!this.phrase.toLowerCase().includes(ch)) {
      this.wrong++;
      this.drawHangmanPart(this.wrong);
    }

    const letters = [
      ...new Set(this.phrase.replace(/\s/g, '').toLowerCase().split('')),
    ];
    const win = letters.every((c) => this.used.has(c));

    if (win) {
      this.done = true;
      this.updateDisplay();
      this.statusText.setText(`✅ Menang! "${this.phrase}"`);
      this.statusText.setColor('#4ade80');
      this.disableAllButtons();
      this.submitScore(true);
      return;
    }

    if (this.wrong >= 6) {
      this.done = true;
      this.phraseText.setText(this.phrase);
      this.statusText.setText(`❌ Kalah! "${this.phrase}"`);
      this.statusText.setColor('#f87171');
      this.disableAllButtons();
      this.submitScore(false);
      return;
    }

    this.updateDisplay();
    this.statusText.setText(
      this.phrase.toLowerCase().includes(ch) ? '👍 Bagus!' : '❌ Belum tepat.',
    );
    this.statusText.setColor(
      this.phrase.toLowerCase().includes(ch) ? '#4ade80' : '#fbbf24',
    );
  }

  private disableAllButtons() {
    this.letterBtns.forEach((b) => {
      b.setAlpha(0.35);
      b.removeInteractive();
    });
  }

  private calculateScore(win: boolean): number {
    const benar = [
      ...new Set(this.phrase.replace(/\s/g, '').toLowerCase().split('')),
    ].filter((c) => this.used.has(c)).length;
    return benar * 10 + (6 - this.wrong) * 15 - this.wrong * 5 + (win ? 40 : 0);
  }

  private async submitScore(win: boolean) {
    try {
      if (!this.sessionCtx) {
        const sr = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ game: 'hangman' }),
        });
        const sj = await sr.json();
        if (sj?.ok) this.sessionCtx = sj;
      }
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          game: 'hangman',
          score: this.calculateScore(win),
          meta: {
            win,
            phrase: this.phrase,
            wrong: this.wrong,
            hint: this.hint,
          },
          sessionId: this.sessionCtx?.sessionId,
          startedAt: this.sessionCtx?.startedAt,
          token: this.sessionCtx?.token,
        }),
      });
    } catch {
      /* best effort */
    }
  }
}
