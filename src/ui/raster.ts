/**
 * Rasterize an SVG image source to a PNG data URL, in the browser.
 *
 * PowerPoint (OOXML) has no SVG support, so SVG backgrounds/figures must be
 * turned into real bitmaps before they can be embedded in a .pptx. HTML/PDF
 * export keeps SVG as-is (browsers render it fine); only PPTX needs this.
 */

/** True for an SVG reference: a data: URL or a path ending in .svg. */
export function isSvgSource(src: string): boolean {
  return /^data:image\/svg\+xml/i.test(src) || /\.svg(\?|#|$)/i.test(src);
}

/**
 * Draw an SVG source onto a canvas at the given pixel size and return a PNG
 * data URL. Rejects if the image can't load (e.g. a cross-origin SVG).
 */
export function svgToPng(src: string, w = 1280, h = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e as Error); // tainted canvas (cross-origin)
      }
    };
    img.onerror = () => reject(new Error("failed to load SVG for rasterization"));
    img.src = src;
  });
}
