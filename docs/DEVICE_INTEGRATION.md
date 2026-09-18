# Camera and live-video integration assessment

**Date:** 2026-11-14

**Status:** Assessment only. No device protocol or live video is implemented, and no physical device has been tested.

## Current boundary and still images

The viewer accepts still images through upload or URL registration. A pre-stitched, standard 2:1 equirectangular image can use these paths; this is format guidance, not a camera compatibility claim. Proprietary RAW, INSP, or INSV files are not promised as direct inputs. Export a supported stitched image first. An optional local gateway or companion could retrieve/stitch files and call the upload API.

## Device interfaces

- **DJI Osmo 360:** DJI's BLE R SDK example lists Osmo 360 and demonstrates recording control, mode switching, and status. It does not establish file download or a complete stitched preview interface. DJI Mimo livestreaming for Osmo 360 is documented only in single-lens mode, not as a full panorama. ([R SDK example](https://github.com/dji-sdk/Osmo-GPS-Controller-Demo), [Mimo guide](https://support.dji.com/help/content?customId=01700006728&lang=en&paperDocType=ARTICLE&re=EE&spaceId=17))
- **RICOH THETA:** Its Web API for THETA A1, X, and Z1 uses HTTP over camera LAN and includes `camera.takePicture`, `camera.listFiles`, downloadable file URLs, and `camera.getLivePreview`. The preview is Motion JPEG and stops when capture starts or shooting mode changes, so it is not a production live-stream interface. ([Web API](https://docs-theta-api.ricoh360.com/web-api/main.html), [file URLs](https://docs-theta-api.ricoh360.com/web-api/commands/listFiles-response-done.html), [preview behavior](https://docs-theta-api.ricoh360.com/web-api/commands/getLivePreview.html))
- **Insta360:** Its Camera and Media SDKs describe camera control, files, preview, stitching, and image/video export. SDK access requires an application; check terms, supported models, and platform before choosing it. Desktop SDK connections use USB, while mobile options vary by OS; panoramic live streaming is documented for Android and iOS. The official app supports RTMP 360 Live for listed models. Reframe Live is a flat view; verify the projection of any webcam output rather than assuming it contains a stitched full sphere. ([SDK](https://onlinemanual.insta360.com/developer/en-us/resource/sdk), [platform limits](https://onlinemanual.insta360.com/developer/en-us/resource/integration), [app livestream](https://onlinemanual.insta360.com/x5/en-us/camera/appuse/live))

## Proposed viewer and media path

The project uses a still-image `EquirectangularAdapter`. Photo Sphere Viewer offers an equirectangular video adapter and `VideoPlugin` for video URLs, `MediaStream`, or `HTMLVideoElement`; adopting them requires packages matched to the installed core and integration into both viewer surfaces. Input must be a complete stitched equirectangular panorama. Do not assume SDK previews or single-lens modes are stitched. A dual-fisheye or unsupported codec needs separate stitching or transcoding; a protocol gateway does not necessarily provide either. ([PSV adapter](https://photo-sphere-viewer.js.org/guide/adapters/equirectangular-video.html), [VideoPlugin](https://photo-sphere-viewer.js.org/plugins/video.html))

For imports, the proposed path is **camera → vendor app or local gateway → optional stitching → existing upload API → gallery**. For live playback, it is **camera/vendor app → supported RTMP or RTSP source → separate media gateway → WebRTC or HLS → PSV video adapter → iframe host**. MediaMTX is one possible gateway, not a selected dependency. WebRTC is a low-latency design preference and HLS a compatibility option; neither is performance-tested. Mobile resolution and bitrate need real-device testing; camera capture resolution does not imply browser live playback resolution. Keep continuous video traffic out of the gallery upload API and SQLite/Base64 image storage; Node can manage stream metadata and sessions while the media service handles video. Keep media services optional for lightweight image-only startup. ([MediaMTX overview](https://mediamtx.org/docs/kickoff/introduction), [browser media streams](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API))

Browser access to USB, Wi-Fi, or Bluetooth cameras cannot be assumed. It depends on available APIs, permission, secure context, and network reachability. Cross-origin rules, camera-origin HTTP, and iframe camera permissions need a deployment-specific design; the current embed interface does not provide them.

## Suggested phases

1. Verify the standard stitched-image import path.
2. Prove one real-device import loop through an official API or local companion.
3. Play an already stitched live source through a separate gateway and PSV adapter.
4. Test long sessions, stream recovery, and mobile browsers before claiming support.
