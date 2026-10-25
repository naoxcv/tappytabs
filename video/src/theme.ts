import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Match the iOS app: AppBackground (0.149 grey) and Theme.accent cream.
export const COLORS = {
  bg: "#262626",
  bgRaised: "#313131",
  cream: "#FFF5DB",
  creamMuted: "rgba(255, 245, 219, 0.62)",
  creamLine: "rgba(255, 245, 219, 0.22)",
};

export const FONTS = {
  heading: "Raleway, sans-serif",
  body: "'Open Sans', sans-serif",
};

export const VIDEO = { width: 1920, height: 1080, fps: 30 };

loadFont({ family: "Raleway", url: staticFile("fonts/Raleway-Variable.ttf"), weight: "100 900" });
loadFont({ family: "Open Sans", url: staticFile("fonts/OpenSans-Variable.ttf"), weight: "300 800" });
