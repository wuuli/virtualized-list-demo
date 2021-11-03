import React, {useCallback, useEffect, useRef, useState} from 'react';
import './App.scss';
import VirtualizedList, {ItemRender, NewItemNoSeenCallback, VirtualizedListRef} from "./components/VirtualizedList";
import faker from 'faker'

function App() {

  const listRef = useRef<VirtualizedListRef>(null)

  const [start, setStart] = useState(false)
  const [dataArr, setDataArr] = useState<string[]>([])
  const [noSeenCount, setNoSeenCount] = useState(0)

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    if (start) {
      timer = setInterval(() => {
        setDataArr(prevState => prevState.concat(faker.lorem.sentences()))
      }, 200)
    }

    return () => {
      timer && clearInterval(timer)
    }
  }, [start])


  const itemRender = useCallback<ItemRender>((index) => {
    return {
      key: index,
      node: (
        <div className={'item'}>
          {dataArr[index]}
        </div>
      )
    }
  }, [dataArr])

  const handleNoSeen = useCallback<NewItemNoSeenCallback>((noSeenItemCount) => {
    setNoSeenCount(noSeenItemCount)
  }, [])

  const handleScrollToBottom = useCallback(() => {
    listRef.current?.scrollToBottom()
  }, [])

  const handleSliceData = useCallback(() => {
    setDataArr(prevState => prevState.slice(Math.floor(prevState.length / 2)))
    // listRef.current?.scrollToBottom()
  }, [])

  return (
    <div className="App">
      <div className={'list-container'}>
        <VirtualizedList
          ref={listRef}
          className={'list'}
          itemRender={itemRender}
          itemCount={dataArr.length}
          onNewItemNoSeen={handleNoSeen}
        />
        {noSeenCount > 0 && (
          <div className={'tip'} onClick={handleScrollToBottom}>{noSeenCount}</div>
        )}
      </div>

      <div className={'btn-group'}>
        <button onClick={() => setStart(prevState => !prevState)}>
          {start ? 'stop' : 'start'}
        </button>
        <button onClick={handleSliceData}>
          slice data
        </button>
      </div>
    </div>
  );
}

export default App;
