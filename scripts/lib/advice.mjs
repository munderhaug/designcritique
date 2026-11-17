// Fix wording that depends on the stack named in PRODUCT.md (## Stack).

/** How to make text follow the user's text-size setting, for this platform and stack. */
export function textScaleAdvice(platform, stacks = []) {
  const has = (s) => stacks.includes(s);
  const root = 'Size type relative to the root (rem, not px) so it follows the text size.';
  if (has('capacitor')) {
    return `${root} In the Capacitor app, ${platform === 'ios'
      ? "iOS WKWebView ignores Dynamic Type by itself: set the root to font: -apple-system-body, or apply the user's preferred size with @capacitor/text-zoom (getPreferred, then set)."
      : "Android's WebView scales text with the system font size (text zoom) unless the app pins it, so don't set the zoom to 100%; check the layout at the largest font size."} Check it on a device with the largest text setting.`;
  }
  if (has('web')) {
    return `${root} A PWA or mobile web page doesn't get ${platform === 'ios' ? 'iOS Dynamic Type unless the root uses font: -apple-system-body' : "the Android font scale through the browser in every case, so test with Chrome's text scaling setting"}; browser zoom and text-size settings scale rem.`;
  }
  if (has('react-native') || has('expo')) return "Leave allowFontScaling on and size text in points, so React Native follows the user's text size; cap it with maxFontSizeMultiplier only where layout truly can't grow.";
  if (has('flutter')) return "Don't fix textScaler to 1.0; use the theme's text styles so Flutter follows the user's text size, and test at the largest setting.";
  return platform === 'ios'
    ? "Size type relative to the root (rem in mockups; Dynamic Type text styles in SwiftUI) so it follows the user's setting."
    : "Size type relative to the root (rem in mockups; sp in Compose) so it follows the user's font scale.";
}
