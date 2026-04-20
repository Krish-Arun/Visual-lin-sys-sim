import { useEffect, useRef, useState } from "react";

export interface AnimationState {
  t: number;
  playing: boolean;
  step: number;
}

export interface UseAnimationOpts {
  duration: number; // ms per step
  playing: boolean;
  loop?: boolean;
  maxSteps?: number;
  onStepComplete?: (nextStep: number) => void;
}

export const easeCos = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

export const useAnimation = (opts: UseAnimationOpts) => {
  const [state, setState] = useState<AnimationState>({
    t: 0,
    playing: false,
    step: 0,
  });
  const lastRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!opts.playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
      return;
    }
    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      setState((s) => {
        const { duration, maxSteps, loop: shouldLoop, onStepComplete } =
          optsRef.current;
        let newT = s.t + dt / duration;
        let newStep = s.step;
        if (newT >= 1) {
          if (maxSteps !== undefined && newStep + 1 >= maxSteps) {
            if (shouldLoop) {
              newStep = 0;
              newT = 0;
            } else {
              newT = 1;
            }
          } else {
            newStep += 1;
            newT = 0;
            onStepComplete?.(newStep);
          }
        }
        return { t: newT, playing: true, step: newStep };
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
    };
  }, [opts.playing]);

  const reset = () => setState({ t: 0, playing: false, step: 0 });
  const setT = (t: number) => setState((s) => ({ ...s, t }));
  const setStep = (step: number) =>
    setState((s) => ({ ...s, step, t: 0 }));

  return { ...state, reset, setT, setStep };
};
