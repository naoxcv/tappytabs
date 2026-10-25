import React from "react";
import { Audio, Composition, interpolate, Series, staticFile } from "remotion";
import { Closing, CLOSING_FRAMES } from "./scenes/Closing";
import { Conversation, CONVERSATION_FRAMES } from "./scenes/Conversation";
import { Decision, DECISION_FRAMES } from "./scenes/Decision";
import { Entrance, ENTRANCE_FRAMES } from "./scenes/Entrance";
import { VIDEO } from "./theme";

// Scenes are separate compositions so each can be previewed and reused alone.
// LaunchVideo stitches them into the full 38 s cut.
const SCENES = [
  { id: "Entrance", component: Entrance, frames: ENTRANCE_FRAMES },
  { id: "Conversation", component: Conversation, frames: CONVERSATION_FRAMES },
  { id: "Decision", component: Decision, frames: DECISION_FRAMES },
  { id: "Closing", component: Closing, frames: CLOSING_FRAMES },
];
const TOTAL = SCENES.reduce((n, s) => n + s.frames, 0);
const MUSIC_VOLUME = 0.7;

/** Background music (scripts/make-music.mjs), starting at `offset` frames into the track. */
const Music: React.FC<{ offset?: number; frames: number }> = ({ offset = 0, frames }) => (
  <Audio
    src={staticFile("audio/bgm.wav")}
    trimBefore={offset}
    volume={(f) => MUSIC_VOLUME * interpolate(f, [0, 6, frames - 6, frames], [offset ? 0 : 1, 1, 1, offset + frames < TOTAL ? 0 : 1])}
  />
);

const LaunchVideo: React.FC = () => (
  <>
    <Music frames={TOTAL} />
    <Series>
      {SCENES.map(({ id, component: Scene, frames }) => (
        <Series.Sequence key={id} durationInFrames={frames}>
          <Scene />
        </Series.Sequence>
      ))}
    </Series>
  </>
);

// A standalone scene plays the matching slice of the track.
const withMusic = (Scene: React.FC, offset: number, frames: number): React.FC => {
  const Scored: React.FC = () => (
    <>
      <Music offset={offset} frames={frames} />
      <Scene />
    </>
  );
  return Scored;
};

let offset = 0;
const STANDALONE = SCENES.map((s) => {
  const c = { ...s, component: withMusic(s.component, offset, s.frames) };
  offset += s.frames;
  return c;
});

export const Root: React.FC = () => (
  <>
    {STANDALONE.map(({ id, component, frames }) => (
      <Composition key={id} id={id} component={component} durationInFrames={frames} {...VIDEO} />
    ))}
    <Composition id="LaunchVideo" component={LaunchVideo} durationInFrames={TOTAL} {...VIDEO} />
  </>
);
