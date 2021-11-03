import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import classNames from 'classnames';
import { debounce, throttle } from 'lodash';
import styles from './index.module.scss';

export type ItemRender = (index: number) => {
  key: string | number;
  node: React.ReactNode;
};

export type NewItemNoSeenCallback = (noSeenItemCount: number) => void;

export interface VirtualizedListRef {
  scrollToBottom: () => void;
}

export interface VirtualizedListProps {
  className?: string;
  height?: number;
  bufferSize?: number;
  estimatedItemHeight?: number;
  itemCount: number;
  itemRender: ItemRender;
  onNewItemNoSeen?: NewItemNoSeenCallback;
}

const searchStartIndex = (itemsBottom: number[], scrollTop: number) => {
  let left = 0;
  let right = itemsBottom.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (itemsBottom[mid] <= scrollTop) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
};

const getIndex = (target: Element) => {
  const indexStr = target.getAttribute('data-index');
  if (!indexStr) {
    throw new Error('target element not found "data-index" attribute');
  }
  return parseInt(indexStr, 10);
};

const VirtualizedList: React.ForwardRefRenderFunction<
  VirtualizedListRef,
  VirtualizedListProps
> = (
  {
    className,
    height,
    bufferSize = 5,
    estimatedItemHeight = 20,
    itemCount,
    itemRender,
    onNewItemNoSeen,
  },
  ref,
) => {
  // element
  const containerRef = useRef<HTMLDivElement>(null);
  const phantomContentRef = useRef<HTMLDivElement>(null);
  const actualContentRef = useRef<HTMLDivElement>(null);

  // cache
  const cacheItemsBottomRef = useRef<number[]>([]);

  const containerHeightRef = useRef(0);
  const bufferSizeRef = useRef(0);
  bufferSizeRef.current = bufferSize;
  const itemCountRef = useRef(0);
  itemCountRef.current = itemCount;

  const scrollTopRef = useRef(0);

  const bottomStickRef = useRef(true);
  const enableBottomStickChangeRef = useRef(true);

  const setBottomStick = useCallback(
    (bottomStick: boolean) => {
      bottomStickRef.current = bottomStick;
      if (bottomStick) {
        noSeenMsgCountRef.current = 0;
        onNewItemNoSeen?.(0);
      }
    },
    [onNewItemNoSeen],
  );

  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  const renderStartRef = useRef(0);
  const renderEndRef = useRef(0);

  const hasSeenEndRef = useRef(0);
  const noSeenMsgCountRef = useRef(0);

  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);

  const newItemAppearRef = useRef(false);
  const containerSizeChangedRef = useRef(false);

  const scrollToBottom = useCallback(
    (el: Element) => {
      const { scrollHeight } = el;
      el.scrollTo({ top: scrollHeight + 10e5, behavior: "auto" });
    },
    [],
  );

  if (cacheItemsBottomRef.current.length !== itemCount) {
    const cacheItemsBottom = cacheItemsBottomRef.current;
    let bottom = cacheItemsBottom[cacheItemsBottom.length - 1] || 0;
    for (let i = cacheItemsBottom.length; i < itemCount; i++) {
      bottom += estimatedItemHeight;
      cacheItemsBottom[i] = bottom;
    }
    if (cacheItemsBottom.length > itemCount) {
      // When the list data discards the previous part of the data,
      // the displayed range remains unchanged.
      const containerEstimatedScrollTop =
        (containerRef.current?.scrollTop || 0) -
        cacheItemsBottom[cacheItemsBottom.length - itemCount - 1];
      containerRef.current?.scrollTo(0, containerEstimatedScrollTop);
      const removedItemCount = cacheItemsBottom.length - itemCount;
      hasSeenEndRef.current = Math.max(
        hasSeenEndRef.current - removedItemCount,
        0,
      );
    }
    cacheItemsBottom.length = itemCount;
  }

  useEffect(() => {
    if (itemCount === 0) {
      setBottomStick(true);
    }
  });

  const cacheItemPosition = useCallback(() => {
    const nodes = actualContentRef.current
      ?.childNodes as NodeListOf<HTMLDivElement>;
    if (!nodes || !nodes.length) {
      return;
    }

    const cacheItemsBottom = cacheItemsBottomRef.current;

    const dValues: number[] = [0];
    nodes.forEach(node => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const index = getIndex(node);
      const oldHeight =
        index > 0
          ? cacheItemsBottom[index] - cacheItemsBottom[index - 1]
          : cacheItemsBottom[0];
      dValues.push(rect.height - oldHeight + dValues[dValues.length - 1]);
    });

    let startIdx = getIndex(nodes[0]);

    for (let i = 1; i < dValues.length; i++) {
      cacheItemsBottom[startIdx] += dValues[i];
      startIdx++;
    }

    const lastDValue = dValues[dValues.length - 1];
    for (let i = startIdx; i < cacheItemsBottom.length; i++) {
      cacheItemsBottom[i] += lastDValue;
    }

    const totalHeight = cacheItemsBottom[cacheItemsBottom.length - 1];

    phantomContentRef.current!.style.height = `${totalHeight}px`;
    scrollTopRef.current = containerRef.current!.scrollTop;
    if (bottomStickRef.current) {
      containerRef.current && scrollToBottom(containerRef.current);
      // containerRef.current?.scrollTo({ top: totalHeight, behavior: 'auto' })
    }
  }, [scrollToBottom]);

  useEffect(() => {
    const throttledCachePosition = throttle(() => {
      cacheItemPosition()
    }, 200, {
      leading: false,
      trailing: true
    })

    const enableScroll = debounce(
      () => {
        enableBottomStickChangeRef.current = true;
      },
      200,
      {
        leading: false,
        trailing: true,
      },
    );

    let preContainerWidth = 0;

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry && entry.target === containerRef.current) {
        const preContainerHeight = containerHeightRef.current;
        containerHeightRef.current = entry.contentRect.height;
        if (preContainerHeight !== containerHeightRef.current) {
          scrollTopRef.current = containerRef.current!.scrollTop;
          setVisibleCount(
            Math.ceil(containerHeightRef.current / estimatedItemHeight),
          );
        }
        const currContainerWidth = entry.contentRect.width
        if (preContainerWidth !== currContainerWidth) {
          throttledCachePosition()
        }
        containerSizeChangedRef.current = true;
        enableBottomStickChangeRef.current = false;
        enableScroll();
      }
    });

    containerRef.current && resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [cacheItemPosition, estimatedItemHeight]);

  useEffect(() => {
    if (newItemAppearRef.current || containerSizeChangedRef.current) {
      // cache items position
      newItemAppearRef.current = false;
      containerSizeChangedRef.current = false;

      cacheItemPosition();
    }
  });

  useLayoutEffect(() => {
    intersectionObserverRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = getIndex(entry.target);
            hasSeenEndRef.current = Math.max(index, hasSeenEndRef.current);
          }
        }
        const newNoSeenMsgCount = bottomStickRef.current
          ? 0
          : itemCountRef.current - 1 - hasSeenEndRef.current;
        if (newNoSeenMsgCount !== noSeenMsgCountRef.current) {
          noSeenMsgCountRef.current = newNoSeenMsgCount;
          onNewItemNoSeen?.(newNoSeenMsgCount);
        }
      },
      {
        root: containerRef.current,
      },
    );

    return () => {
      intersectionObserverRef.current?.disconnect();
    };
  }, [onNewItemNoSeen]);

  useEffect(() => {
    const newNoSeenMsgCount = bottomStickRef.current
      ? 0
      : itemCount - hasSeenEndRef.current - 1;
    if (newNoSeenMsgCount !== noSeenMsgCountRef.current) {
      noSeenMsgCountRef.current = newNoSeenMsgCount;
      onNewItemNoSeen?.(newNoSeenMsgCount);
    }
  }, [itemCount, onNewItemNoSeen]);

  useLayoutEffect(() => {
    // When the list data discards the previous part of the data,
    // phantomHeight will change,
    // which maybe cause scrollTop changing
    scrollTopRef.current = containerRef.current!.scrollTop;
  });

  const handleScroll = useCallback(throttle(() => {
    const preScrollTop = scrollTopRef.current;
    scrollTopRef.current = containerRef.current!.scrollTop;

    if (enableBottomStickChangeRef.current) {
      if (!bottomStickRef.current) {
        const phantomBottom =
          phantomContentRef.current!.getBoundingClientRect().bottom;
        const containerBottom =
          containerRef.current!.getBoundingClientRect().bottom;
        if (phantomBottom <= containerBottom + 10) {
          setBottomStick(true);
        }
      }

      const preContainerHeight = containerHeightRef.current;
      containerHeightRef.current =
        containerRef.current!.getBoundingClientRect().height;
      if (
        preScrollTop > scrollTopRef.current &&
        preContainerHeight === containerHeightRef.current
      ) {
        setBottomStick(false);
      }
    }

    setVisibleStart(
      searchStartIndex(cacheItemsBottomRef.current, scrollTopRef.current),
    );
  }, 100, {
    leading: true,
    trailing: true,
  }), [setBottomStick]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom() {
        setBottomStick(true);
        containerRef.current && scrollToBottom(containerRef.current);
      },
    }),
    [scrollToBottom, setBottomStick],
  );

  const lastRenderEnd = renderEndRef.current;
  renderEndRef.current = Math.min(
    visibleStart + visibleCount + bufferSize,
    itemCount,
  );

  const lastRenderStart = renderStartRef.current;
  renderStartRef.current = Math.max(
    renderEndRef.current - visibleCount - bufferSize * 2,
    0,
  );

  if (
    renderStartRef.current < lastRenderStart ||
    renderEndRef.current > lastRenderEnd
  ) {
    newItemAppearRef.current = true;
  }

  const items = [];
  for (let i = renderStartRef.current; i < renderEndRef.current; i++) {
    items.push(itemRender(i));
  }

  const phantomHeight =
    cacheItemsBottomRef.current[cacheItemsBottomRef.current.length - 1] || 0;

  const offsetTop =
    renderStartRef.current > 0
      ? cacheItemsBottomRef.current[renderStartRef.current - 1]
      : 0;

  return (
    <div
      ref={containerRef}
      className={classNames(styles.container, className)}
      onScroll={handleScroll}>
      <div
        ref={phantomContentRef}
        style={{
          height: `${phantomHeight}px`,
          position: 'relative',
        }}
      />
      <div
        ref={actualContentRef}
        style={{
          width: '100%',
          position: 'absolute',
          top: '0',
          transform: `translate3d(0, ${offsetTop}px, 0)`,
        }}>
        {items.map(({ key, node }, i) => (
          <Item
            key={key}
            index={renderStartRef.current + i}
            intersectionObserverRef={intersectionObserverRef}>
            {node}
          </Item>
        ))}
      </div>
    </div>
  );
};

interface ItemProps {
  index: number;
  intersectionObserverRef: React.MutableRefObject<IntersectionObserver | null>;
}

const Item: React.FC<ItemProps> = ({
  children,
  index,
  intersectionObserverRef,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    itemRef.current &&
      intersectionObserverRef.current?.observe(itemRef.current);
    return () => {
      itemRef.current &&
        intersectionObserverRef.current?.unobserve(itemRef.current);
    };
  }, []);

  return (
    <div ref={itemRef} data-index={index}>
      {children}
    </div>
  );
};

export default React.forwardRef(VirtualizedList);
