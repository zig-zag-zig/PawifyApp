import { StyleSheet } from 'react-native';

export function getModalStyles() {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modal: {
      backgroundColor: '#2a2a2a',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 400,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#fff',
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: '#ccc',
      marginBottom: 20,
      textAlign: 'center',
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 16,
      gap: 12,
    },
  });
}

export function getMenuStyles() {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: 18,
    },
    screenTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: '#f8fafc',
      marginBottom: 6,
      letterSpacing: 0,
    },
    section: {
      marginTop: 14,
    },
    menuCard: {
      backgroundColor: '#1f232b',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#303742',
      overflow: 'hidden',
      elevation: 0,
      shadowColor: '#000',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    menuCardDanger: {
      borderColor: '#5b2a2a',
      backgroundColor: '#221818',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: '#323945',
      backgroundColor: 'transparent',
    },
    menuItemLast: {
      borderBottomWidth: 0,
    },
    menuItemStatic: {
      opacity: 1,
    },
    menuItemDisabled: {
      opacity: 0.62,
    },
    menuItemDanger: {
      backgroundColor: 'transparent',
    },
    menuIcon: {
      marginRight: 16,
    },
    menuLabelContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    menuLabel: {
      fontSize: 16,
      color: '#f1f5f9',
      fontWeight: '600',
    },
    menuLabelDanger: {
      color: '#ef4444',
      fontWeight: 'bold',
    },
    menuSubtitle: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 18,
      color: '#9ca3af',
    },
    menuRight: {
      marginLeft: 8,
    },
  });
}
