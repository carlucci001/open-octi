# Gesture Mode

## What it does

Gesture Mode turns a camera-tracked hand into an optional workspace controller: pinch to click, move an open palm to scroll, and hold a fist for about 600 milliseconds to close the top dialog. It is off and inert by default.

## Where it lives

- Route: available on authenticated workspace routes.
- Sidebar: use the floating hand button at the bottom-left of the application.

## Enable it

Select **Turn on Gesture Mode**, allow camera access, and wait for the tracking status. Select the control again to stop tracking. Turning it off cancels animation work and releases the camera stream.

## What it needs

- A browser with `getUserMedia` support.
- Camera permission and an available camera.
- Network access for the MediaPipe hand-landmark model on first load.

## Limits and safety

Tracking may switch itself off when permission is denied, no camera exists, or another application owns the camera. Accuracy depends on lighting, framing, and browser performance.
