"use client";

import {
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import { storage } from "@/lib/firebase/client";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
}

/**
 * Uploads a condition photo for a client's intake. Returns the storage object
 * path (not a URL), which is what we persist on the intake document.
 * Path matches storage rules: intake/{clientId}/{file}
 */
export async function uploadIntakePhoto(
  uid: string,
  file: File,
): Promise<string> {
  const path = `intake/${uid}/${Date.now()}-${safeName(file.name)}`;
  await uploadBytes(ref(storage as FirebaseStorage, path), file, {
    contentType: file.type,
  });
  return path;
}

/**
 * Uploads a provider's profile photo. Returns both the storage path and a
 * public download URL (provider photos are public-read).
 * Path matches storage rules: providers/{providerId}/{file}
 */
export async function uploadProviderPhoto(
  uid: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const path = `providers/${uid}/${Date.now()}-${safeName(file.name)}`;
  const r = ref(storage as FirebaseStorage, path);
  await uploadBytes(r, file, { contentType: file.type });
  const url = await getDownloadURL(r);
  return { path, url };
}

/** Resolves a storage object path to a temporary download URL. */
export async function pathToUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage as FirebaseStorage, path));
}
