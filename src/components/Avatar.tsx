"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CONFIGURABLE AVATAR URL:
 * To customize or replace the 3D male avatar model:
 * 1. Host your GLB file publicly (or place it in /public/avatars/me.glb)
 * 2. Ensure the GLB model includes standard ARKit blend shapes or Oculus Visemes
 * 3. Update the DEFAULT_AVATAR_URL constant below with your custom URL path/address.
 */
export const DEFAULT_AVATAR_URL =
  "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/avatarsdk.glb";

// Helper to inject the required three.js importmap script into <head>
function ensureImportMap() {
  const IMPORT_MAP_ID = "talkinghead-importmap";
  if (document.getElementById(IMPORT_MAP_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = IMPORT_MAP_ID;
  script.type = "importmap";
  script.textContent = JSON.stringify({
    imports: {
      three:
        "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js/+esm",
      "three/examples/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/",
      "three/addons/":
        "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    },
  });
  document.head.appendChild(script);
}

interface AvatarProps {
  avatarUrl?: string;
  className?: string;
}

export default function Avatar({
  avatarUrl = DEFAULT_AVATAR_URL,
  className = "",
}: AvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initTalkingHead() {
      if (!containerRef.current) return;

      try {
        setLoading(true);
        setError(null);

        ensureImportMap();

        // Dynamically import TalkingHead module from CDN
        const moduleUrl =
          "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/modules/talkinghead.mjs";
        // @ts-ignore
        const { TalkingHead } = await import(/* webpackIgnore: true */ moduleUrl);

        if (!isMounted || !containerRef.current) return;

        // Clean up any previous instance before creating a new one
        if (headInstanceRef.current) {
          try {
            if (typeof headInstanceRef.current.destroy === "function") {
              headInstanceRef.current.destroy();
            } else if (typeof headInstanceRef.current.stop === "function") {
              headInstanceRef.current.stop();
            }
          } catch {
            // Ignore cleanup errors
          }
          headInstanceRef.current = null;
        }

        // Initialize TalkingHead
        const head = new TalkingHead(containerRef.current, {
          cameraView: "upper",
          cameraRotateEnable: true,
          cameraPanEnable: false,
          cameraZoomEnable: false,
          lightAmbientColor: 0xffffff,
          lightAmbientIntensity: 2.2,
          lightDirectColor: 0x88ccff,
          lightDirectIntensity: 3.0,
        });

        headInstanceRef.current = head;

        // Load avatar GLB
        await head.showAvatar(
          {
            url: avatarUrl,
            body: "M",
            avatarMood: "neutral",
            baseline: {
              headRotateX: -0.04,
              eyeBlinkLeft: 0.05,
              eyeBlinkRight: 0.05,
            },
          },
          (ev: ProgressEvent) => {
            // Optional progress tracking
          }
        );

        if (isMounted) {
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Failed to initialize TalkingHead avatar:", err);
        if (isMounted) {
          setError(
            err?.message || "Failed to load avatar. Please check your connection."
          );
          setLoading(false);
        }
      }
    }

    initTalkingHead();

    return () => {
      isMounted = false;
      if (headInstanceRef.current) {
        try {
          if (typeof headInstanceRef.current.destroy === "function") {
            headInstanceRef.current.destroy();
          } else if (typeof headInstanceRef.current.stop === "function") {
            headInstanceRef.current.stop();
          }
        } catch {
          // Ignore errors on unmount
        }
        headInstanceRef.current = null;
      }
    };
  }, [avatarUrl]);

  return (
    <div
      className={`relative w-full h-full min-h-[220px] bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center border border-zinc-800 shadow-sm ${className}`}
    >
      {/* Container where TalkingHead mounts canvas */}
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      {/* Loading state indicator */}
      {loading && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 p-4 z-10 text-center">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
          <p className="text-xs font-medium text-zinc-300">
            Loading 3D Avatar...
          </p>
        </div>
      )}

      {/* Error state indicator */}
      {error && !loading && (
        <div className="absolute inset-0 bg-zinc-950/90 flex flex-col items-center justify-center gap-2 p-4 z-10 text-center">
          <svg
            className="w-8 h-8 text-amber-500 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-xs font-medium text-zinc-300 max-w-[200px]">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
