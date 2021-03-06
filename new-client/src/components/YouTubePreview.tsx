import React, { FunctionComponent } from 'react';
import { Box } from '@chakra-ui/react';

interface YouTubePreviewProps {
  videoId: string;
  startTime: number;
}

const YouTubePreview: FunctionComponent<YouTubePreviewProps> = ({ videoId, startTime }: YouTubePreviewProps) => {
  const src = `https://www.youTube.com/embed/${videoId}?${startTime}`;

  return (
    <Box>
      <iframe title="YouTube video" height="180x" width="320px" src={src} allowFullScreen frameBorder="0" />
    </Box>
  );
};

export default YouTubePreview;
