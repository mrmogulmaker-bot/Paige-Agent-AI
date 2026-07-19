// RiveRuntime — the lazy inner that mounts the actual Rive runtime.
//
// This file is the ONE place @rive-app/react-canvas is imported, so the dep is
// code-split behind RiveEmbed's dynamic import and only loads when a real `src`
// is wired (a later wave). It is intentionally minimal this wave: it proves the
// dependency imports + typechecks and provides the mount point, without shipping
// a bundled .riv scene of our own (§13 honesty, §29 wrapper-only).
import { useRive } from "@rive-app/react-canvas";

export interface RiveRuntimeProps {
  src: string;
  stateMachine?: string;
}

export default function RiveRuntime({ src, stateMachine }: RiveRuntimeProps) {
  const { RiveComponent } = useRive({
    src,
    stateMachines: stateMachine,
    autoplay: true,
  });
  return <RiveComponent className="h-full w-full" />;
}
