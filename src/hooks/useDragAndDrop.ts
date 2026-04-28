'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Category, DragItem, DragPhase, DropTarget } from '@/lib/types';

interface UseDragAndDropOptions {
  categories: Category[];
  onMoveCategory: (categoryId: string, newParentId: string | null) => Promise<void>;
  onMoveRequest: (requestId: string, newCategoryId: string | null) => Promise<void>;
  onExpandCategory: (categoryId: string) => void;
}

interface UseDragAndDropResult {
  phase: DragPhase;
  dragItem: DragItem | null;
  dropTarget: DropTarget;
  ghostPos: { x: number; y: number };
  handlePointerDown: (e: React.PointerEvent, item: DragItem) => void;
  isDragSource: (id: string) => boolean;
  isActiveDropTarget: (target: DropTarget) => boolean;
  isValidTarget: (categoryId: string) => boolean;
  wasJustDragging: () => boolean;
  isPressingSource: (id: string) => boolean;
}

export function isDescendant(ancestorId: string, nodeId: string, categories: Category[]): boolean {
  let current = categories.find(c => c.id === nodeId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = categories.find(c => c.id === current!.parentId);
  }
  return false;
}

function findDropTarget(x: number, y: number): DropTarget {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  let node: Element | null = el;
  while (node) {
    const zoneType = node.getAttribute('data-drop-zone-type');
    if (zoneType === 'root') return { type: 'root' };
    if (zoneType === 'category') {
      const id = node.getAttribute('data-drop-zone-id');
      if (id) return { type: 'category', id };
    }
    node = node.parentElement;
  }
  return null;
}

export function useDragAndDrop(options: UseDragAndDropOptions): UseDragAndDropResult {
  const [phase, setPhase] = useState<DragPhase>('idle');
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

  const phaseRef = useRef<DragPhase>('idle');
  const dragItemRef = useRef<DragItem | null>(null);
  const dropTargetRef = useRef<DropTarget>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartPosRef = useRef({ x: 0, y: 0 });
  const capturedPointerIdRef = useRef<number>(-1);
  const capturedElementRef = useRef<HTMLElement | null>(null);
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHoverCatRef = useRef<string | null>(null);
  const justDraggedRef = useRef(false);
  const pressItemRef = useRef<DragItem | null>(null);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  // Always-current reset function for use inside event handlers (avoids stale closures)
  const doResetRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    doResetRef.current = () => {
      if (pressTimerRef.current !== null) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      if (autoExpandTimerRef.current !== null) {
        clearTimeout(autoExpandTimerRef.current);
        autoExpandTimerRef.current = null;
      }
      if (capturedElementRef.current !== null && capturedPointerIdRef.current >= 0) {
        try {
          capturedElementRef.current.releasePointerCapture(capturedPointerIdRef.current);
        } catch {
          // Capture may already be released (e.g. on pointerup/pointercancel)
        }
      }
      prevHoverCatRef.current = null;
      capturedPointerIdRef.current = -1;
      capturedElementRef.current = null;
      phaseRef.current = 'idle';
      dragItemRef.current = null;
      dropTargetRef.current = null;
      pressItemRef.current = null;
      setPhase('idle');
      setDragItem(null);
      setDropTarget(null);
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, item: DragItem) => {
    if (phaseRef.current !== 'idle') return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const el = e.currentTarget as HTMLElement;

    pressStartPosRef.current = { x: startX, y: startY };
    capturedPointerIdRef.current = e.pointerId;
    capturedElementRef.current = el;
    el.setPointerCapture(e.pointerId);
    pressItemRef.current = item;
    phaseRef.current = 'pressing';
    setPhase('pressing');

    pressTimerRef.current = setTimeout(() => {
      phaseRef.current = 'dragging';
      dragItemRef.current = item;
      setPhase('dragging');
      setDragItem(item);
      setGhostPos({ x: startX, y: startY });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 1000);
  }, []);

  // Document-level pointer event handlers (set up once, use refs for mutable state)
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== capturedPointerIdRef.current) return;

      if (phaseRef.current === 'pressing') {
        const dx = e.clientX - pressStartPosRef.current.x;
        const dy = e.clientY - pressStartPosRef.current.y;
        if (dx * dx + dy * dy > 25) {
          doResetRef.current();
        }
        return;
      }

      if (phaseRef.current !== 'dragging') return;

      setGhostPos({ x: e.clientX, y: e.clientY });

      const rawTarget = findDropTarget(e.clientX, e.clientY);
      let validTarget: DropTarget = null;

      if (rawTarget?.type === 'root') {
        validTarget = rawTarget;
      } else if (rawTarget?.type === 'category') {
        const item = dragItemRef.current;
        if (item) {
          if (item.type === 'request') {
            validTarget = rawTarget;
          } else {
            const cats = optionsRef.current.categories;
            if (item.id !== rawTarget.id && !isDescendant(item.id, rawTarget.id, cats)) {
              validTarget = rawTarget;
            }
          }
        }
      }

      dropTargetRef.current = validTarget;
      setDropTarget(validTarget);

      if (rawTarget?.type === 'category' && rawTarget.id !== prevHoverCatRef.current) {
        if (autoExpandTimerRef.current !== null) {
          clearTimeout(autoExpandTimerRef.current);
        }
        prevHoverCatRef.current = rawTarget.id;
        autoExpandTimerRef.current = setTimeout(() => {
          optionsRef.current.onExpandCategory(rawTarget.id);
        }, 700);
      } else if (rawTarget?.type !== 'category') {
        if (autoExpandTimerRef.current !== null) {
          clearTimeout(autoExpandTimerRef.current);
          autoExpandTimerRef.current = null;
        }
        prevHoverCatRef.current = null;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== capturedPointerIdRef.current) return;

      if (phaseRef.current === 'pressing') {
        doResetRef.current();
        return;
      }

      if (phaseRef.current === 'dragging') {
        const target = dropTargetRef.current;
        const item = dragItemRef.current;
        justDraggedRef.current = true;
        doResetRef.current();
        if (target && item) {
          const newParent = target.type === 'category' ? target.id : null;
          if (item.type === 'category') {
            optionsRef.current.onMoveCategory(item.id, newParent).catch(console.error);
          } else {
            optionsRef.current.onMoveRequest(item.id, newParent).catch(console.error);
          }
          if (target.type === 'category') {
            optionsRef.current.onExpandCategory(target.id);
          }
        }
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'dragging') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doResetRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase]);

  const isDragSource = useCallback((id: string): boolean => {
    return phaseRef.current === 'dragging' && dragItemRef.current?.id === id;
  }, []);

  const isActiveDropTarget = useCallback((target: DropTarget): boolean => {
    const dt = dropTargetRef.current;
    if (!dt || !target) return false;
    if (target.type === 'root') return dt.type === 'root';
    if (target.type === 'category' && dt.type === 'category') return target.id === dt.id;
    return false;
  }, []);

  const isValidTarget = useCallback((categoryId: string): boolean => {
    const item = dragItemRef.current;
    if (!item) return false;
    if (item.type === 'request') return true;
    if (item.id === categoryId) return false;
    return !isDescendant(item.id, categoryId, optionsRef.current.categories);
  }, []);

  const wasJustDragging = useCallback((): boolean => {
    const was = justDraggedRef.current;
    if (was) {
      setTimeout(() => { justDraggedRef.current = false; }, 0);
    }
    return was;
  }, []);

  const isPressingSource = useCallback((id: string): boolean => {
    return phaseRef.current === 'pressing' && pressItemRef.current?.id === id;
  }, []);

  return {
    phase,
    dragItem,
    dropTarget,
    ghostPos,
    handlePointerDown,
    isDragSource,
    isActiveDropTarget,
    isValidTarget,
    wasJustDragging,
    isPressingSource,
  };
}
