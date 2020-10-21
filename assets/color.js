'use strict';

export function getColumnNightColor(columnColor, satRatio = 0.75) {
  const hsl = rgb2hsl(hex2rgb(columnColor));
  hsl[1] *= satRatio;
  return rgb2hex(hsl2rgb(hsl));
}

export function blendHexColors(background, overlay, alpha) {
  return rgb2hex(blendRgbColors(hex2rgb(background), hex2rgb(overlay), alpha));
}

export function blendRgbColors(background, overlay, alpha) {
  return [
    Math.round(overlay[0] * alpha + background[0] * (1 - alpha)),
    Math.round(overlay[1] * alpha + background[1] * (1 - alpha)),
    Math.round(overlay[2] * alpha + background[2] * (1 - alpha))
  ];
}

export function hex2rgb(hex) {
  return [
    parseInt(hex.substr(1, 2), 16),
    parseInt(hex.substr(3, 2), 16),
    parseInt(hex.substr(5, 2), 16),
  ];
}

export function rgb2hex(color) {
  let result = '#';
  for (const channel of color) {
    result += channel.toString(16).padStart(2, '0');
  }
  return result;
}


export function rgb2hsl(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

export function hsl2rgb(hsl) {
  const [h, s, l] = hsl;

  let r = 0;
  let g = 0;
  let b = 0;

  const hue2rgb = (p, q, t) => {
    if (t < 0) {
      t += 1;
    }
    if (t > 1) {
      t -= 1;
    }
    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
      return q;
    }
    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
  };

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
