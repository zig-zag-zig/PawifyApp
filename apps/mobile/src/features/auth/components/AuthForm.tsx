import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Button, TextField, Spinner } from '../../../components/ui';
import { GoogleSignInButton } from '../../../components/GoogleSignInButton';
import { AuthFormProps } from './types';

const AuthForm: React.FC<AuthFormProps> = ({
    mode,
    email,
    password,
    confirmPassword,
    isLoading,
    setEmail,
    setPassword,
    setConfirmPassword,
    onSubmit,
    onKeyPress,
}) => {
    const styles = getStyles();
    const canUseGoogleSignIn = Platform.OS === 'android';

    return (
        <>
            <Spinner isLoading={isLoading} />

            {canUseGoogleSignIn && (
                <>
                    <View style={styles.googleButtonContainer}>
                        <GoogleSignInButton />
                    </View>

                    <View style={styles.dividerContainer}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or continue with email</Text>
                        <View style={styles.dividerLine} />
                    </View>
                </>
            )}

            <TextField
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={onKeyPress}
                email={true}
            />
            <TextField
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureText
                showPasswordToggle
                onSubmitEditing={onKeyPress}
            />

            {mode === 'signUp' && (
                <TextField
                    placeholder="Confirm Password"
                    value={confirmPassword!}
                    onChangeText={setConfirmPassword!}
                    secureText
                    showPasswordToggle
                    onSubmitEditing={onKeyPress}
                />
            )}

            <Button onPress={onSubmit} disabled={isLoading}>
                {mode === 'signIn' ? 'Sign In' : 'Sign Up'}
            </Button>
        </>
    );
};

const getStyles = () => StyleSheet.create({
    googleButtonContainer: {
        marginVertical: 20,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#333',
    },
    dividerText: {
        marginHorizontal: 16,
        color: '#888',
        fontSize: 14,
        fontWeight: '400',
    },
});

export default AuthForm;
