import React from 'react';
import { LayoutChangeEvent, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ArtistMinimal } from '@pawify/shared';
import { nameWithDisambiguation } from '@pawify/shared';
import { getStyles } from '../styles/styles';
import { CachedImageComponent } from './cachedImage/CachedImageComponent';
import { SelectableText } from './ui';

interface ArtistMinimalCardProps {
  artist: ArtistMinimal;
  profileImageUrl?: string | null;
  showProfileImageSpinnerWhenMissing?: boolean;
  showDisambiguation?: boolean;
  smallPicture?: boolean;
  compactTouchTarget?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  isSelected?: boolean;
  onLayout?: (event: LayoutChangeEvent, id: string) => void;
}

const ArtistMinimalCard: React.FC<ArtistMinimalCardProps> = ({
  artist,
  profileImageUrl,
  showProfileImageSpinnerWhenMissing = false,
  showDisambiguation = false,
  smallPicture,
  compactTouchTarget = false,
  onPress,
  onLongPress,
  isSelected = false,
  onLayout,
}) => {
  const styles = getStyles();
  const { width } = useWindowDimensions();
  const pictureSize = smallPicture ? 70 : 90;
  const compactTextMaxWidth = Math.max(120, width - pictureSize - 72);

  const containerStyle = [
    styles.artistMinimalContainer,
    compactTouchTarget && {
      // Stretch across the full row so the entire row is a tap target
      // instead of only the picture/name area.
      alignSelf: 'stretch' as const,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    isSelected && { backgroundColor: '#1a5276' },
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      // Press-in dimming flashes rows while scrolling or long-pressing to
      // select; selection state itself is the visual feedback.
      activeOpacity={1}
      style={containerStyle}
      onLayout={(e) => onLayout ? onLayout(e, artist.id) : undefined}
    >
      <CachedImageComponent
        imageUrl={profileImageUrl}
        type="profile"
        showSpinnerWhenNoImage={showProfileImageSpinnerWhenMissing}
        style={smallPicture ? styles.roundPictureSmall : styles.roundPicture}
      />
      <View
        style={[
          styles.relationshipInfo,
          compactTouchTarget && {
            flex: 0,
            flexShrink: 1,
            maxWidth: compactTextMaxWidth,
          },
        ]}
      >
        <SelectableText
          style={smallPicture ? styles.roundPictureSmallText : styles.roundPictureText}
          numberOfLines={2}
          ellipsizeMode="tail"
          selectable={false}
        >
          {artist.name}
        </SelectableText>
      </View>
    </TouchableOpacity>
  );
};

export default ArtistMinimalCard;
