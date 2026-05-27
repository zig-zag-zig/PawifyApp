import { StyleSheet } from 'react-native';

export const CONTAINER_HORIZONTAL_PADDING = 30;

export const getStyles = () => {
  const colors = {
    background: '#121212',
    text: '#FFF',
    inputBackground: '#333',
    button: '#6200ee',
    modalBackground: '#333',
    sectionHeader: '#252525',
    relationshipBackground: '#1E1E1E',
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: CONTAINER_HORIZONTAL_PADDING,
      paddingTop: 16,
      paddingBottom: 0,
      backgroundColor: colors.background,
    },
    text: {
      color: colors.text,
    },
    input: {
      padding: 10,
      fontSize: 16,
      backgroundColor: 'transparent',
      color: colors.text,
      borderWidth: 0,
      borderRadius: 0,
      marginVertical: 0,
      marginBottom: 0,
    },
    inputWrapper: {
      borderRadius: 25,
      overflow: 'hidden',
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
    },
    inputContainer: {
      position: 'relative',
      marginVertical: 10,
      marginBottom: 10,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
      zIndex: 999,
      elevation: 999,
    },
    releaseDate: {
      fontSize: 14,
      color: '#888',
      marginBottom: 4,
    },
    artists: {
      fontSize: 14,
      color: '#BBB',
      marginBottom: 4,
    },
    releaseItem: {
      marginBottom: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    coverContainerReleases: {
      width: 100,
      height: 100,
      marginRight: 16,
    },
    coverArtReleases: {
      width: '100%',
      height: '100%',
      borderRadius: 8,
    },
    releaseInfo: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    albumContainer: {
      width: '48%',
      alignItems: 'center',
      paddingBottom: 2,
    },
    albumCover: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 8,
    },
    albumName: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: 'bold',
      color: colors.text,
    },
    albumNameGrid: {
      marginTop: 8,
      width: '100%',
      minHeight: 36,
      fontSize: 14,
      fontWeight: 'bold',
      lineHeight: 18,
      textAlign: 'center',
      color: colors.text,
      includeFontPadding: false,
    },
    releaseItemTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      lineHeight: 18,
      color: colors.text,
    },
    section: {
      marginBottom: 20,
    },
    firstSection: {
      marginTop: 20,
    },
    sectionHeaderText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 10,
    },
    artistPageBlock: {
      marginHorizontal: 0,
    },
    artistHeaderTextContainer: {
      marginTop: 50,
      marginHorizontal: 0,
    },
    textContainer: {
      paddingHorizontal: CONTAINER_HORIZONTAL_PADDING,
      marginTop: 50,
    },
    releaseCoverContainer: {
      marginHorizontal: CONTAINER_HORIZONTAL_PADDING,
      marginTop: 4,
    },
    releaseScrollView: {
      marginHorizontal: -CONTAINER_HORIZONTAL_PADDING,
    },
    releaseTracksBleedContainer: {
      marginTop: 14,
      alignSelf: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.text,
    },
    TouchableText: {
      marginVertical: 10,
    },
    TextOfTouchableText: {
      color: '#007AFF',
      fontSize: 16,
      fontWeight: '500',
    },
    songCard: {
      backgroundColor: colors.relationshipBackground,
      borderRadius: 8,
      padding: 16,
      marginVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 5,
    },
    songTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    releaseTitle: {
      fontWeight: 'bold',
      fontSize: 32,
      paddingVertical: 20,
      color: colors.text,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContainer: {
      width: '80%',
      padding: 20,
      backgroundColor: colors.modalBackground,
      borderRadius: 10,
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 10,
    },
    modalMessage: {
      fontSize: 16,
      color: colors.text,
      marginBottom: 20,
      textAlign: 'center',
    },
    button: {
      marginTop: 10,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.button,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 120,
      alignSelf: 'center',
    },
    buttonText: {
      color: '#FFF',
      fontWeight: '500',
      fontSize: 14,
    },
    groupAffiliationsContainer: {
      marginTop: 20,
      marginBottom: 10,
    },
    groupAffiliationsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.sectionHeader,
      borderRadius: 8,
    },
    groupAffiliationsTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    groupAffiliationsContent: {
      marginTop: 8,
    },
    relationshipGroup: {
      marginBottom: 16,
    },
    relationshipGroupTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    relationshipList: {
      paddingHorizontal: 8,
    },
    relationshipItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      backgroundColor: colors.relationshipBackground,
      borderRadius: 8,
      padding: 10,
    },
    relationshipInfo: {
      marginLeft: 10,
      flex: 1,
    },
    relationshipDates: {
      fontWeight: 'normal',
      color: '#BBB',
    },
    artistMinimalContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
    },
    roundPicture: {
      width: 90,
      height: 90,
      borderRadius: 45,
    },
    roundPictureSmall: {
      width: 70,
      height: 70,
      borderRadius: 35,
    },
    roundPictureText: {
      fontWeight: 'bold',
      fontSize: 18,
      lineHeight: 24,
      color: colors.text,
    },
    roundPictureSmallText: {
      fontWeight: 'bold',
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
    },
  });
};
