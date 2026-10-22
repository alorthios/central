import { photoTextures } from '../theme.ts';

/**
 * Les textures photographiques du thème `photo` (#55), toutes sous licence CC0 :
 * bois et cuir de Poly Haven, papier et liège d'ambientCG (crédits dans le README).
 */
export const PHOTO_TEXTURES = {
  frameWood: '/textures/frame-wood.jpg',
  leather: '/textures/leather.jpg',
} as const;

export type PhotoTexture = keyof typeof PHOTO_TEXTURES;

const images = new Map<PhotoTexture, HTMLImageElement>();

/**
 * Charge les textures avant de dessiner le panneau : les canevas du thème vintage les
 * utilisent alors comme motifs. Sans le thème `photo`, ne fait rien.
 */
export async function loadPhotoTextures(): Promise<void> {
  if (!photoTextures) return;
  await Promise.all(
    (Object.entries(PHOTO_TEXTURES) as [PhotoTexture, string][]).map(async ([name, src]) => {
      const image = new Image();
      image.src = src;
      try {
        await image.decode();
        images.set(name, image);
      } catch {
        // Texture introuvable : le dessin calculé du thème vintage prend le relais.
      }
    }),
  );
}

/** La texture chargée, ou null : le thème vintage dessine alors sa matière lui-même. */
export function photo(name: PhotoTexture): HTMLImageElement | null {
  return images.get(name) ?? null;
}
