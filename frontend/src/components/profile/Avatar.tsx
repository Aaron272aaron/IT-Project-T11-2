import { useState } from "react";

// Generate a real SVG image without sending the user's name to another service.
export function initialsAvatar(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    parts.length > 1
      ? [...parts[0]][0] + [...parts[parts.length - 1]][0]
      : [...(parts[0] || "?")].slice(0, 2).join("")
  ).toUpperCase();
  const escaped = initials.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#e6f7fd"/><text x="64" y="66" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="46" font-weight="600" fill="#071a46">${escaped}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function Avatar({
  name,
  src,
  large = false,
}: {
  name: string;
  src?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  return (
    <img
      className={`profile-avatar${large ? " large" : ""}`}
      src={src && src !== failed ? src : initialsAvatar(name)}
      alt={`${name || "User"} avatar`}
      onError={() => setFailed(src || "")}
    />
  );
}

// Store a bounded thumbnail, rather than a multi-megabyte original, in demo storage.
export async function readAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose an image smaller than 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image preview is unavailable.");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/png");
  } catch {
    throw new Error(
      "This image could not be opened. Choose a valid PNG, JPG or WebP image.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
