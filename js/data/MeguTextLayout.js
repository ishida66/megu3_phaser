// Shared text selection, measurement, wrapping, and sizing helpers for the Main scene.
// Methods are mixed into Main.prototype after game.js declares the scene class.
Object.assign(Main.prototype, {
  getLocalizedString(strings) {
    const list = Array.isArray(strings) ? strings : [];
    const wanted = this.language === 'ja' ? 'ja' : 'en';
    const alternate = wanted === 'ja' ? 'en' : 'ja';
    return list.find(entry => entry && String(entry._lang || '').toLowerCase() === wanted)
      || list.find(entry => entry && String(entry._lang || '').toLowerCase() === alternate)
      || list[0] || {};
  },

  // Keep the game UI copy in its original English. The language toggle only
  // selects text supplied by the source JSON entries (_lang: en / ja); it does
  // not translate interface labels.
  uiText(key) {
    return key;
  },

  getTextMeasureContext() {
    if (!this._textMeasureContext && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      this._textMeasureContext = canvas.getContext('2d');
    }
    return this._textMeasureContext || null;
  },

  wrapTextToWidth(value, maxWidth, fontSize, fontFamily = 'sans-serif') {
    const source = String(value == null ? '' : value).replace(/\r/g, '');
    const ctx = this.getTextMeasureContext();
    if (ctx) ctx.font = `${fontSize}px ${fontFamily}`;
    const measure = text => ctx
      ? ctx.measureText(text).width
      : Array.from(text).reduce((sum, ch) => sum + (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff00-\uffef]/u.test(ch) ? fontSize : fontSize * 0.56), 0);
    const lines = [];
    const noLineStart = '、。，．！？：；）」』】〕〉》…ー・';
    source.split('\n').forEach(paragraph => {
      if (!paragraph) { lines.push(''); return; }
      let line = '';
      for (const ch of Array.from(paragraph)) {
        if (!line) { line = ch === ' ' ? '' : ch; continue; }
        const candidate = line + ch;
        if (measure(candidate) <= maxWidth) {
          line = candidate;
        } else if (noLineStart.includes(ch)) {
          // Keep Japanese closing punctuation with the preceding phrase.
          line += ch;
          lines.push(line.trimEnd());
          line = '';
        } else {
          lines.push(line.trimEnd());
          line = ch === ' ' ? '' : ch;
        }
      }
      if (line || !lines.length) lines.push(line.trimEnd());
    });
    return lines.length ? lines : [''];
  },

  fitTextToBounds(textObject, value, options = {}) {
    if (!textObject || !textObject.active) return;
    const isJapanese = this.language === 'ja';
    const text = String(value == null ? '' : value);
    const width = Math.max(8, Number(options.width) || W - 24);
    const height = Math.max(8, Number(options.height) || 40);
    const family = options.fontFamily || 'sans-serif';
    const baseSize = Number(isJapanese ? (options.jaBaseSize ?? options.baseSize) : (options.enBaseSize ?? options.baseSize)) || 16;
    const minSize = isJapanese ? (Number(options.jaMinSize) || 7) : baseSize;
    const maxLines = Math.max(1, Number(isJapanese ? (options.jaMaxLines ?? options.maxLines) : (options.enMaxLines ?? options.maxLines)) || 1);
    const lineSpacing = Number(options.lineSpacing ?? 0);

    if (!isJapanese) {
      textObject.setStyle({ fontSize: `${baseSize}px`, wordWrap: { width }, maxLines, lineSpacing });
      textObject.setText(text);
      return;
    }

    let chosenSize = minSize;
    let chosenLines = this.wrapTextToWidth(text, width, chosenSize, family);
    for (let size = baseSize; size >= minSize; size--) {
      const lines = this.wrapTextToWidth(text, width, size, family);
      const estimatedHeight = lines.length * (size * 1.2 + lineSpacing);
      if (lines.length <= maxLines && estimatedHeight <= height) {
        chosenSize = size;
        chosenLines = lines;
        break;
      }
    }

    const ctx = this.getTextMeasureContext();
    if (ctx) ctx.font = `${chosenSize}px ${family}`;
    const measure = line => ctx ? ctx.measureText(line).width : Array.from(line).length * chosenSize;
    if (chosenLines.length > maxLines) {
      chosenLines = chosenLines.slice(0, maxLines);
      let last = String(chosenLines[maxLines - 1] || '').trimEnd();
      while (last && measure(last + '…') > width) last = Array.from(last).slice(0, -1).join('');
      chosenLines[maxLines - 1] = last ? last + '…' : '…';
    }
    // A single extremely long line may need an ellipsis even after shrinking to
    // the minimum font size. This guarantees it will not spill beyond the box.
    chosenLines = chosenLines.map(line => {
      let safe = line;
      while (safe && measure(safe) > width) safe = Array.from(safe).slice(0, -1).join('');
      return safe;
    });
    textObject.setStyle({ fontSize: `${chosenSize}px`, wordWrap: { width }, maxLines, lineSpacing });
    textObject.setText(chosenLines.join('\n'));
  },

  fitFooterNameText(textObject, value) {
    if (!textObject) return;
    if (this.language === 'ja') {
      this.fitTextToBounds(textObject, value, { width: 255, height: 16, jaBaseSize: 13, jaMinSize: 7, jaMaxLines: 1, enBaseSize: 13, enMaxLines: 1 });
    } else {
      textObject.setStyle({ fontSize: '13px', maxLines: 1 });
      textObject.setText(String(value == null ? '' : value));
    }
  },
 });
