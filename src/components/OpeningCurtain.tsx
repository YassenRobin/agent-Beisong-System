import { useEffect, useRef, useState } from 'react';
import roofUrl from '../assets/roof-transparent.png';

type CurtainPoint = {
  x: number;
  y: number;
  restX: number;
  restY: number;
  previousX: number;
  previousY: number;
};

type CurtainStrand = {
  points: CurtainPoint[];
  characters: string[];
  segmentLength: number;
};

type OpeningCurtainProps = {
  onComplete: () => void;
};

const CURTAIN_TEXT =
  '蒹葭苍苍白露为霜所谓伊人在水一方关关雎鸠在河之洲窈窕淑女君子好逑长风破浪会有时直挂云帆济沧海山重水复疑无路柳暗花明又一村海内存知己天涯若比邻明月松间照清泉石上流';

function seededRandom(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export default function OpeningCurtain({ onComplete }: OpeningCurtainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exitTimerRef = useRef<number>();
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => () => {
    if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let strands: CurtainStrand[] = [];
    let frameId = 0;
    let framePending = false;
    let lastFrameTime = performance.now();
    let calmFrameCount = 0;
    let simulationActive = false;

    const pointer = {
      x: -1000,
      y: -1000,
      previousX: -1000,
      previousY: -1000,
      pressed: false,
      insideCurtain: false,
      movedAt: 0,
    };

    const getRoofMetrics = () => {
      const roofWidth = Math.min(width * (width < 720 ? 0.9 : 0.72), 1040);
      const roofTop = Math.max(56, height * 0.055);
      return {
        centerX: width / 2,
        roofWidth,
        curtainTop: roofTop + roofWidth / 3.12 - 8,
      };
    };

    const buildCurtain = () => {
      const { centerX, roofWidth, curtainTop } = getRoofMetrics();
      const curtainWidth = roofWidth * 0.67;
      const strandCount = Math.max(16, Math.min(28, Math.floor(curtainWidth / 29)));
      const usableHeight = Math.max(190, height - curtainTop - 118);

      strands = Array.from({ length: strandCount }, (_, strandIndex) => {
        const random = seededRandom(strandIndex * 977 + 53);
        const progress = strandCount === 1 ? 0.5 : strandIndex / (strandCount - 1);
        const x = centerX - curtainWidth / 2 + progress * curtainWidth;
        const edgeDistance = Math.abs(progress - 0.5) * 2;
        const strandHeight = usableHeight * (0.76 + random() * 0.19 - edgeDistance * 0.045);
        const segmentLength = width < 720 ? 27 : 29;
        const pointCount = Math.max(9, Math.floor(strandHeight / segmentLength));
        const startY = curtainTop + Math.sin(progress * Math.PI) * 3;
        const points = Array.from({ length: pointCount }, (_, pointIndex) => {
          const y = startY + pointIndex * segmentLength;
          return {
            x,
            y,
            restX: x,
            restY: y,
            previousX: x,
            previousY: y,
          };
        });
        const textOffset = Math.floor(random() * CURTAIN_TEXT.length);
        const characters = points.map((_, pointIndex) => (
          CURTAIN_TEXT[(textOffset + pointIndex * (strandIndex % 4 === 0 ? 2 : 1)) % CURTAIN_TEXT.length]
        ));

        return { points, characters, segmentLength };
      });

      simulationActive = false;
      calmFrameCount = 0;
    };

    const drawCurtain = () => {
      context.clearRect(0, 0, width, height);
      context.font = `${width < 720 ? 11 : 12}px "Noto Serif SC", "Songti SC", STSong, serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      strands.forEach((strand, strandIndex) => {
        const { points } = strand;
        context.strokeStyle = 'rgba(36, 25, 18, 0.22)';
        context.lineWidth = 0.55;
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
          context.lineTo(points[pointIndex].x, points[pointIndex].y);
        }
        context.stroke();

        for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
          const point = points[pointIndex];
          const previousPoint = points[pointIndex - 1];
          const rotation = Math.atan2(
            point.y - previousPoint.y,
            point.x - previousPoint.x,
          ) - Math.PI / 2;
          const movement = Math.min(1, Math.abs(point.x - point.previousX) / 6);

          context.save();
          context.translate(point.x, point.y);
          context.rotate(rotation);
          context.fillStyle = `rgba(24, 18, 14, ${0.76 + movement * 0.12 - (strandIndex % 4) * 0.018})`;
          context.fillText(strand.characters[pointIndex], 0, 0);
          context.restore();
        }
      });
    };

    const solveStrand = (strand: CurtainStrand, delta: number, isPointerMoving: boolean) => {
      const { points } = strand;

      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const point = points[pointIndex];
        const velocityX = (point.x - point.previousX) * 0.84;
        const velocityY = (point.y - point.previousY) * 0.84;
        point.previousX = point.x;
        point.previousY = point.y;
        point.x += velocityX + (point.restX - point.x) * 0.014 * delta;
        point.y += velocityY + 0.075 * delta + (point.restY - point.y) * 0.006 * delta;

        if (isPointerMoving) {
          const distanceX = point.x - pointer.x;
          const distanceY = point.y - pointer.y;
          const horizontalRadius = width < 720 ? 10 : 12;
          const verticalRadius = width < 720 ? 34 : 42;
          const distance = Math.hypot(
            distanceX / horizontalRadius,
            distanceY / verticalRadius,
          );

          if (distance < 1) {
            const influence = (1 - distance) ** 2;
            const pointerDeltaX = pointer.x - pointer.previousX;
            const pointerDeltaY = pointer.y - pointer.previousY;
            const speed = Math.max(1, Math.hypot(pointerDeltaX, pointerDeltaY));
            const speedLimit = Math.min(1, 9 / speed);
            point.x += pointerDeltaX * speedLimit * influence * 0.42;
            point.y += pointerDeltaY * speedLimit * influence * 0.045;
          }
        }
      }

      for (let pass = 0; pass < 4; pass += 1) {
        points[0].x = points[0].restX;
        points[0].y = points[0].restY;
        points[0].previousX = points[0].restX;
        points[0].previousY = points[0].restY;

        for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
          const upperPoint = points[pointIndex - 1];
          const lowerPoint = points[pointIndex];
          const distanceX = lowerPoint.x - upperPoint.x;
          const distanceY = lowerPoint.y - upperPoint.y;
          const distance = Math.max(0.001, Math.hypot(distanceX, distanceY));
          const correction = (distance - strand.segmentLength) / distance;
          const lowerShare = pointIndex === 1 ? 1 : 0.54;
          lowerPoint.x -= distanceX * correction * lowerShare;
          lowerPoint.y -= distanceY * correction * lowerShare;
          if (pointIndex > 1) {
            upperPoint.x += distanceX * correction * (1 - lowerShare);
            upperPoint.y += distanceY * correction * (1 - lowerShare);
          }
        }
      }
    };

    const settleCurtain = () => {
      strands.forEach((strand) => strand.points.forEach((point) => {
        point.x = point.restX;
        point.y = point.restY;
        point.previousX = point.restX;
        point.previousY = point.restY;
      }));
      simulationActive = false;
      calmFrameCount = 0;
      drawCurtain();
    };

    const requestFrame = () => {
      if (framePending) return;
      framePending = true;
      frameId = requestAnimationFrame(renderFrame);
    };

    function renderFrame(time: number) {
      framePending = false;
      const delta = Math.min(1.5, (time - lastFrameTime) / 16.67);
      lastFrameTime = time;
      const pointerSpeed = Math.hypot(
        pointer.x - pointer.previousX,
        pointer.y - pointer.previousY,
      );
      const isPointerMoving = pointer.insideCurtain
        && (pointer.pressed || time - pointer.movedAt < 52)
        && pointerSpeed > 0.14;

      let greatestMovement = 0;
      if (simulationActive) {
        strands.forEach((strand) => {
          solveStrand(strand, delta, isPointerMoving);
          strand.points.forEach((point) => {
            greatestMovement = Math.max(
              greatestMovement,
              Math.hypot(point.x - point.previousX, point.y - point.previousY),
            );
          });
        });
      }

      drawCurtain();
      pointer.previousX = pointer.x;
      pointer.previousY = pointer.y;

      if (!isPointerMoving && greatestMovement < 0.045) calmFrameCount += 1;
      else calmFrameCount = 0;

      if (!isPointerMoving && (calmFrameCount > 14 || time - pointer.movedAt > 2600)) {
        settleCurtain();
        return;
      }
      if (simulationActive) requestFrame();
    }

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.15 : 1.35);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      buildCurtain();
      drawCurtain();
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const { centerX, roofWidth, curtainTop } = getRoofMetrics();
      const isInside = x > centerX - roofWidth * 0.37
        && x < centerX + roofWidth * 0.37
        && y > curtainTop - 18;

      if (!isInside) {
        pointer.insideCurtain = false;
        pointer.x = x;
        pointer.y = y;
        pointer.previousX = x;
        pointer.previousY = y;
        return;
      }

      if (!pointer.insideCurtain) {
        pointer.previousX = x;
        pointer.previousY = y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.insideCurtain = true;

      const speed = Math.hypot(
        pointer.x - pointer.previousX,
        pointer.y - pointer.previousY,
      );
      if (speed > 0.45) {
        pointer.movedAt = performance.now();
        simulationActive = true;
        calmFrameCount = 0;
        setHasInteracted(true);
        requestFrame();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointer.pressed = true;
      canvas.setPointerCapture?.(event.pointerId);
      updatePointer(event);
    };
    const handlePointerUp = () => {
      pointer.pressed = false;
      pointer.previousX = pointer.x;
      pointer.previousY = pointer.y;
    };
    const handlePointerLeave = () => {
      pointer.pressed = false;
      pointer.insideCurtain = false;
      pointer.x = -1000;
      pointer.y = -1000;
      pointer.previousX = -1000;
      pointer.previousY = -1000;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('pointermove', updatePointer);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  const enterSystem = () => {
    if (isLeaving) return;
    setIsLeaving(true);
    exitTimerRef.current = window.setTimeout(onComplete, 920);
  };

  return (
    <section
      className={`opening-curtain${isLeaving ? ' opening-curtain--leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="檐下字雨开幕"
    >
      <canvas ref={canvasRef} className="opening-curtain__canvas" aria-hidden="true" />

      <div className="opening-curtain__roof" aria-hidden="true">
        <img src={roofUrl} alt="" />
      </div>

      <header className="opening-curtain__masthead" aria-hidden="true">
        <div className="opening-curtain__brand">
          北诵
          <span>古诗文背诵闯关</span>
        </div>
        <div className="opening-curtain__edition">檐下字雨 · 开卷</div>
      </header>

      <aside className="opening-curtain__copy" aria-hidden="true">
        <span>一场写给记忆的开幕</span>
        <h1>字落成帘，<br />手经过时，<br />诗便有了回声。</h1>
      </aside>

      <div
        className={`opening-curtain__hint${hasInteracted ? ' opening-curtain__hint--quiet' : ''}`}
        aria-hidden="true"
      >
        <i />
        <span>移动鼠标或滑动手指<br />轻拨檐下文字</span>
      </div>

      <div className="opening-curtain__entry">
        <button type="button" autoFocus onClick={enterSystem}>
          <span>进入背诵系统</span>
          <i aria-hidden="true">→</i>
        </button>
        <small>点击开卷，檐下雾色随即散去</small>
      </div>
    </section>
  );
}
