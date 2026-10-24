/**
 * High-Clarity Responsive Image Delivery & Optimization Utilities
 * StayPilot Stage 8A: High-Clarity Screenshots with Zero Performance Regression
 */

/**
 * Returns an optimized Supabase transformation URL for an asset.
 * Uses Supabase's native /render/image/public/ endpoint when applicable.
 * Preserves the original URL if external, unrecognized, or if transformation is disabled.
 *
 * @param {string} src - The original public storage URL.
 * @param {Object} options
 * @param {number} [options.width] - Target display width in pixels.
 * @param {number} [options.quality=88] - WebP/AVIF quality (80-92).
 * @param {string} [options.format='webp'] - Target format ('webp', 'origin', 'avif').
 * @param {string} [options.resize='contain'] - Resizing strategy ('contain' or 'cover').
 * @returns {string} The transformed URL or original URL.
 */
export function getOptimizedImageUrl(src, { width, quality = 88, format = 'webp', resize = 'contain' } = {}) {
  if (!src || typeof src !== 'string') return src;

  // Supabase public storage object pattern:
  // e.g., https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/...
  if (src.includes('/storage/v1/object/public/')) {
    const base = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    const params = new URLSearchParams();
    if (width) params.set('width', Math.round(width).toString());
    if (resize) params.set('resize', resize);
    if (quality) params.set('quality', quality.toString());
    if (format) params.set('format', format);
    return `${base}?${params.toString()}`;
  }

  return src;
}

/**
 * Returns responsive srcset, sizes, and fallback src for desktop web dashboard screenshots.
 * Container width: 350px (mobile) to 1000px (desktop), 1x to 2x DPR.
 *
 * @param {string} src - The original source screenshot URL.
 * @returns {{ src: string, srcSet: string|undefined, sizes: string|undefined }}
 */
export function getWebScreenshotSrcSet(src) {
  if (!src || typeof src !== 'string' || !src.includes('/storage/v1/object/public/')) {
    return { src, srcSet: undefined, sizes: undefined };
  }

  // 600w: mobile viewports
  // 1000w: standard 1x desktop (renders at ~950px-1000px)
  // 1400w: 1.5x displays / laptop screens
  // 1920w: 2x high-DPI Retina / 4K monitors (pin-sharp text)
  const widths = [600, 1000, 1400, 1920];
  const srcSet = widths
    .map(w => `${getOptimizedImageUrl(src, { width: w, quality: 88, format: 'webp' })} ${w}w`)
    .join(', ');

  const sizes = '(max-width: 768px) 94vw, (max-width: 1200px) 85vw, 1000px';
  const fallbackSrc = getOptimizedImageUrl(src, { width: 1000, quality: 88, format: 'webp' });

  return { src: fallbackSrc, srcSet, sizes };
}

/**
 * Returns responsive srcset, sizes, and fallback src for mobile phone screenshots.
 * Container width: 190px - 260px in phone mockups, 1x to 3x DPR.
 *
 * @param {string} src - The original source screenshot URL.
 * @returns {{ src: string, srcSet: string|undefined, sizes: string|undefined }}
 */
export function getMobileScreenshotSrcSet(src) {
  if (!src || typeof src !== 'string' || !src.includes('/storage/v1/object/public/')) {
    return { src, srcSet: undefined, sizes: undefined };
  }

  // 360w: 1x mobile / small preview
  // 480w: standard 2x mockup on desktop (~230px * 2)
  // 720w: 3x high-DPI modern phones (~240px * 3)
  // 1080w: max original resolution for crisp native UI text
  const widths = [360, 480, 720, 1080];
  const srcSet = widths
    .map(w => `${getOptimizedImageUrl(src, { width: w, quality: 90, format: 'webp' })} ${w}w`)
    .join(', ');

  const sizes = '(max-width: 768px) 220px, 260px';
  const fallbackSrc = getOptimizedImageUrl(src, { width: 480, quality: 90, format: 'webp' });

  return { src: fallbackSrc, srcSet, sizes };
}
