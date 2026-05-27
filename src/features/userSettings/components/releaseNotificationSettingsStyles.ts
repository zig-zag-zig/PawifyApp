import { StyleSheet } from 'react-native';

export function getReleaseNotificationSettingsStyles() {
  return StyleSheet.create({
    cardContent: {
      paddingHorizontal: 18,
      paddingVertical: 16,
      gap: 14,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: {
      color: '#f1f5f9',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0,
    },
    description: {
      color: '#9ca3af',
      fontSize: 13,
      lineHeight: 18,
    },
    optionGroup: {
      gap: 8,
    },
    optionLabel: {
      color: '#cbd5e1',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      minHeight: 38,
      minWidth: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      backgroundColor: '#111827',
      borderColor: '#303742',
    },
    chipSelected: {
      backgroundColor: '#073b33',
      borderColor: '#2f8f66',
    },
    chipText: {
      color: '#dbe4ee',
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0,
    },
    chipTextSelected: {
      color: '#86efac',
    },
    toggleRow: {
      minHeight: 34,
      paddingTop: 2,
    },
    toggleTitleRow: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    toggleTitle: {
      flex: 1,
      color: '#f1f5f9',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0,
    },
    toggleSubtitle: {
      color: '#9ca3af',
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
      paddingRight: 64,
    },
  });
}
