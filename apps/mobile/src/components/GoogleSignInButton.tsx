import React from 'react';
import { Platform, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Svg, { G, Path, Defs, ClipPath, Rect } from 'react-native-svg';
import { useAuth } from '../contexts/AuthContext';
import { isGoogleSignInCancellation } from '../features/auth/hooks/useGoogleAuth';
import { getUserFacingErrorMessage } from '../services/userFacingErrors';
import { useToast } from '../contexts/ToastContext';

const GoogleLogo = () => (
    <Svg width="20" height="20" viewBox="0 0 21 20" fill="none">
        <G clipPath="url(#clip0_12302_63595)">
            <Path
                d="M20.4893 10.1873C20.4893 9.36791 20.4213 8.76998 20.274 8.1499H10.6991V11.8482H16.3193C16.2061 12.7673 15.5942 14.1514 14.2344 15.0815L14.2153 15.2053L17.2428 17.4971L17.4525 17.5176C19.3788 15.7791 20.4893 13.2213 20.4893 10.1873Z"
                fill="#4285F4"
            />
            <Path
                d="M10.6991 19.9312C13.4526 19.9312 15.7641 19.0453 17.4525 17.5173L14.2344 15.0812C13.3733 15.6681 12.2175 16.0777 10.6991 16.0777C8.00229 16.0777 5.71339 14.3393 4.89746 11.9365L4.77786 11.9464L1.62991 14.3271L1.58875 14.439C3.26576 17.6944 6.71047 19.9312 10.6991 19.9312Z"
                fill="#34A853"
            />
            <Path
                d="M4.89735 11.9368C4.68206 11.3168 4.55747 10.6523 4.55747 9.96583C4.55747 9.27927 4.68206 8.61492 4.88603 7.99484L4.88032 7.86278L1.69292 5.44385L1.58863 5.49232C0.897454 6.84324 0.500854 8.36026 0.500854 9.96583C0.500854 11.5714 0.897454 13.0884 1.58863 14.4393L4.89735 11.9368Z"
                fill="#FBBC05"
            />
            <Path
                d="M10.6992 3.85335C12.6141 3.85335 13.9059 4.66167 14.6424 5.33716L17.5206 2.59106C15.7529 0.985494 13.4526 0 10.6992 0C6.71049 0 3.26576 2.23671 1.58875 5.49212L4.88615 7.99464C5.71341 5.59182 8.00232 3.85335 10.6992 3.85335Z"
                fill="#EB4335"
            />
        </G>
        <Defs>
            <ClipPath id="clip0_12302_63595">
                <Rect width="20" height="20" fill="white" transform="translate(0.5)" />
            </ClipPath>
        </Defs>
    </Svg>
);

export const GoogleSignInButton: React.FC = () => {
    const [loading, setLoading] = React.useState(false);
    const { signInWithGoogle } = useAuth();
    const { showToast } = useToast();

    if (Platform.OS !== 'android') {
        return null;
    }

    const handlePress = async () => {
        setLoading(true);

        try {
            await signInWithGoogle();
        } catch (err) {
            if (isGoogleSignInCancellation(err)) {
                console.warn('google-sign-in-button: google sign-in cancelled or blocked by Google Play Services', err);
            } else {
                console.error('google-sign-in-button: google sign-in failed', err);
                showToast(getUserFacingErrorMessage(err, 'Google sign-in failed. Please try again.'), 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const styles = getStyles();

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handlePress}
                disabled={loading}
            >
                <GoogleLogo />
                <Text style={styles.label}>
                    {loading ? 'Opening Google...' : 'Continue with Google'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const getStyles = () => StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 24,
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333',
        elevation: 1,
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        height: 44,
        minWidth: 200,
    },
    buttonDisabled: {
        opacity: 0.72,
    },
    label: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 16,
        letterSpacing: 0.25,
    },
});
