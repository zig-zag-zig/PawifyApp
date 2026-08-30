import { StyleSheet } from 'react-native';

export const EXTERNAL_LINK_BUTTON_WIDTH = 74;
export const EXTERNAL_LINK_BUTTON_HEIGHT = 58;
export const EXTERNAL_LINK_GRID_GAP = 8;
export const EXTERNAL_LINK_GRID_HORIZONTAL_PADDING = 4;

export const styles = StyleSheet.create({
    container: {
        marginTop: 14,
        marginBottom: 4,
        width: '100%',
        alignSelf: 'stretch',
        overflow: 'visible',
    },
    grid: {
        gap: EXTERNAL_LINK_GRID_GAP,
        paddingHorizontal: EXTERNAL_LINK_GRID_HORIZONTAL_PADDING,
        overflow: 'visible',
    },
    gridRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: EXTERNAL_LINK_GRID_GAP,
        overflow: 'visible',
    },
    overflowGrid: {
        marginTop: 8,
    },
    linkButton: {
        width: EXTERNAL_LINK_BUTTON_WIDTH,
        height: EXTERNAL_LINK_BUTTON_HEIGHT,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 5,
        paddingVertical: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactLinkButton: {
        width: EXTERNAL_LINK_BUTTON_WIDTH,
        height: EXTERNAL_LINK_BUTTON_HEIGHT,
        paddingHorizontal: 5,
    },
    iconBox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    linkLabelViewport: {
        width: '100%',
        height: 14,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    linkLabel: {
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 13,
        textAlign: 'center',
    },
    compactLinkLabel: {
        fontSize: 11,
        fontWeight: '700',
    },
    staticLinkLabel: {},
    scrollingLinkLabelTrack: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
    },
    scrollingLinkLabel: {
        textAlign: 'left',
    },
    measureLinkLabel: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1000,
        opacity: 0,
        alignSelf: 'flex-start',
        textAlign: 'left',
    },
    moreChip: {
        width: EXTERNAL_LINK_BUTTON_WIDTH,
        height: EXTERNAL_LINK_BUTTON_HEIGHT,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gridPlaceholder: {
        width: EXTERNAL_LINK_BUTTON_WIDTH,
        height: EXTERNAL_LINK_BUTTON_HEIGHT,
    },
    urlPreviewAnchor: {
        position: 'absolute',
        zIndex: 20,
        elevation: 20,
        overflow: 'visible',
    },
    urlPreviewBanner: {
        width: '100%',
        minHeight: 58,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 9,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
    },
    urlPreviewText: {
        fontSize: 12,
        fontWeight: '800',
        lineHeight: 15,
        flexWrap: 'wrap',
        textAlign: 'center',
        flexShrink: 1,
    },
});
