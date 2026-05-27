import type { AuthMode } from '../model/types';

export interface AuthFormProps {
    mode: AuthMode;
    email: string;
    password: string;
    confirmPassword?: string;
    isLoading: boolean;
    setEmail: (text: string) => void;
    setPassword: (text: string) => void;
    setConfirmPassword?: (text: string) => void;
    onSubmit: () => void;
    onKeyPress: () => void;
}
