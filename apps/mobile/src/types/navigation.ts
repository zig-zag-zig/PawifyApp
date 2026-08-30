import { StackNavigationProp } from "@react-navigation/stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { ReleaseGroupReleaseListItem } from "@pawify/shared";

export type HomeTabParamList = {
    Search: undefined;
    Artists: undefined;
    Releases: undefined;
    Menu: undefined;
};

export type RootStackParamList = {
    Menu: undefined;
    SignIn: undefined;
    SignUp: undefined;
    ForgotPassword: undefined;
    ResetPassword: { tempToken: string };
    Security: { actionType: 'delete' | 'password' | 'email' };
    Search: undefined;
    Artists: undefined;
    Releases: undefined;
    Artist: { artistId: string };
    Release: { releaseId: string };
    ReleaseGroup: {
        releaseGroupId?: string;
        releases: ReleaseGroupReleaseListItem[];
        initialReleaseCoverTaskId?: string | null;
        initialReleaseCovers?: Record<string, string | null>;
    };
    Auth: undefined;
    Home: NavigatorScreenParams<HomeTabParamList> | undefined;
};

export type ReleaseNavigationProp = StackNavigationProp<RootStackParamList, 'Release'>;
export type ReleaseGroupNavigationProp = StackNavigationProp<RootStackParamList, 'ReleaseGroup'>;
export type ArtistNavigationProp = StackNavigationProp<RootStackParamList, 'Artist'>;
export type ResetPasswordNavigationProp = StackNavigationProp<RootStackParamList, 'ResetPassword'>;
export type SecurityNavigationProp = StackNavigationProp<RootStackParamList, 'Security'>;
