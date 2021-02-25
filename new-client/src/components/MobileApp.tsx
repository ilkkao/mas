import React, { FunctionComponent, useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Box, Slide } from '@chakra-ui/react';
import { Sidebar, Window } from '.';
import { ServerContext } from './ServerContext';

interface MobileAppProps {
  firstRenderComplete: () => void;
}

const MobileApp: FunctionComponent<MobileAppProps> = ({ firstRenderComplete }: MobileAppProps) => {
  const { windowStore } = useContext(ServerContext);
  const [windowSelector, setWindowSelector] = useState(true);

  useEffect(firstRenderComplete, [firstRenderComplete]);

  const onSwitchWindow = () => {
    setWindowSelector(false);
  };

  const onExit = () => {
    setWindowSelector(true);
  };

  return (
    <>
      <Slide direction="left" in={windowSelector} style={{ zIndex: 10 }}>
        <Box height="100%" bgColor="red.300">
          <Sidebar mode="mobile" onSwitchWindow={onSwitchWindow} showDesktops={false} />
        </Box>
      </Slide>

      {windowStore.activeWindow && <Window onExit={onExit} mobile={true} window={windowStore.activeWindow} />}
    </>
  );
};

export default observer(MobileApp);