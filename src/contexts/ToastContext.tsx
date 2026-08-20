import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { InfoBanner } from '../components/InfoBanner';

type ToastType = 'error' | 'success' | 'info';
type ToastPosition = 'top' | 'bottom';

interface ToastContextType {
    showToast: (message: string, type: ToastType, onDismiss?: (() => void), visible?: boolean, position?: ToastPosition, timeout?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

interface ToastProviderProps {
    children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [toast, setToast] = useState<{
        id: number;
        message: string;
        type: ToastType;
        position?: ToastPosition;
        onDismiss?: (() => void);
        visible?: boolean;
    } | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const modalMountRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastIdRef = useRef(0);
    const onDismissRef = useRef<(() => void) | null>(null);

    const dismissCurrentToast = (invokeCallback: boolean) => {
        if (invokeCallback && onDismissRef.current) {
            onDismissRef.current();
        }
        onDismissRef.current = null;
    };

    const showToast = (message: string, type: ToastType, onDismiss?: (() => void), visible?: boolean, position?: ToastPosition, timeout?: number) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (modalMountRef.current) {
            clearTimeout(modalMountRef.current);
            modalMountRef.current = null;
        }

        // Whatever toast is currently shown is ending: its onDismiss must
        // run even when it is being replaced by a new toast (previously the
        // callback was silently dropped on replacement).
        dismissCurrentToast(true);

        if (visible === false) {
            setToast(null);
            return;
        }

        const nextToast = {
            id: toastIdRef.current + 1,
            message,
            type,
            onDismiss,
            visible,
            position,
        };
        toastIdRef.current = nextToast.id;
        onDismissRef.current = onDismiss ?? null;
        setToast(null);
        modalMountRef.current = setTimeout(() => {
            setToast(nextToast);
            modalMountRef.current = null;
        }, 0);

        // Errors persist longer by default (they used to never auto-dismiss,
        // which left stale error banners on screen); pass timeout: 0 to keep
        // an error on screen until dismissed.
        const effectiveTimeoutMs = timeout ?? (type === 'error' ? 8000 : 2500);
        if (effectiveTimeoutMs > 0) {
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                dismissCurrentToast(true);
                setToast(null);
            }, effectiveTimeoutMs);
        }
    };

    useEffect(() => () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        if (modalMountRef.current) {
            clearTimeout(modalMountRef.current);
        }
    }, []);

    const dismissToast = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        dismissCurrentToast(true);
        setToast(null);
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            <View style={styles.root}>
                {children}
                {toast && (
                    <InfoBanner
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        visible={toast.visible !== undefined ? toast.visible : true}
                        onDismiss={dismissToast}
                        position={toast.position}
                    />
                )}
            </View>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        position: 'relative',
    },
});
