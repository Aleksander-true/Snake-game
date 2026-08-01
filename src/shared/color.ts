/** Darken a hex or rgb color by a factor (0 = unchanged, 1 = black). */
export function darkenColor(color: string, factor: number): string {
  const rgbChannels = color.startsWith('#')
    ? [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map(channel => parseInt(channel, 16))
    : (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  const [red = 0, green = 0, blue = 0] = rgbChannels;
  const brightnessMultiplier = 1 - factor;
  return `rgb(${Math.round(red * brightnessMultiplier)},${Math.round(green * brightnessMultiplier)},${Math.round(blue * brightnessMultiplier)})`;
}

/** Convert a snake color to the grey used after its death. */
export function getDeadSnakeColor(hex: string): string {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const greyLevel = Math.round(red * 0.3 + green * 0.3 + blue * 0.3);
  return `rgb(${greyLevel},${greyLevel},${greyLevel})`;
}
