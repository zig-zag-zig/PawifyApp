import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import type { ExternalLink, ExternalLinkService } from '@pawify/shared';
import { SelectableText } from '../../../components/ui';
import {
    normalizeLinks,
    type RankedExternalLink,
} from '../../../components/externalLinks/externalLinkRanking';
import {
    SERVICE_LABELS,
    STREAMING_SERVICES,
} from '../../../components/externalLinks/externalLinkConstants';
import { openExternalUrl } from '../../../services/externalNavigation';
import {
    loadPreferredStreamingService,
    savePreferredStreamingService,
} from '../../../services/preferredStreamingService';

interface ListenNowButtonProps {
    links: ExternalLink[];
}

const pickStreamingLinks = (links: ExternalLink[]): RankedExternalLink[] =>
    normalizeLinks(links).filter((link) => STREAMING_SERVICES.has(link.resolvedService));

/**
 * "Listen on {service}" — opens the release on the user's preferred streaming
 * service when that service links this release, otherwise the best-ranked
 * streaming link. Long-press offers a picker that also stores the preference.
 */
const ListenNowButton = ({ links }: ListenNowButtonProps) => {
    const [preferredService, setPreferredService] = React.useState<ExternalLinkService | null>(null);

    React.useEffect(() => {
        let isCancelled = false;
        void loadPreferredStreamingService().then((service) => {
            if (!isCancelled) {
                setPreferredService(service);
            }
        });
        return () => {
            isCancelled = true;
        };
    }, []);

    const streamingLinks = React.useMemo(() => pickStreamingLinks(links), [links]);
    const selectedLink =
        streamingLinks.find((link) => link.resolvedService === preferredService) ??
        streamingLinks[0] ??
        null;

    const onPress = React.useCallback(() => {
        if (selectedLink) {
            void openExternalUrl(selectedLink.normalizedUrl);
        }
    }, [selectedLink]);

    const onLongPress = React.useCallback(() => {
        if (streamingLinks.length === 0) {
            return;
        }

        const buttons = streamingLinks.map((link) => ({
            text: SERVICE_LABELS[link.resolvedService] ?? link.displayLabel,
            onPress: () => {
                setPreferredService(link.resolvedService);
                void savePreferredStreamingService(link.resolvedService);
                void openExternalUrl(link.normalizedUrl);
            },
        }));

        Alert.alert('Listen on…', 'Sets your preferred streaming service.', [
            ...buttons,
            { text: 'Cancel', style: 'cancel' as const },
        ]);
    }, [streamingLinks]);

    if (!selectedLink) {
        return null;
    }

    const serviceLabel =
        SERVICE_LABELS[selectedLink.resolvedService] ?? selectedLink.displayLabel;

    return (
        <TouchableOpacity
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityLabel={`Listen on ${serviceLabel}. Long-press to choose a different service.`}
            style={styles.button}
        >
            <MaterialIcons name="play-circle-fill" size={18} color="#121212" />
            <SelectableText style={styles.label} selectable={false}>
                Listen on {serviceLabel}
            </SelectableText>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        borderRadius: 999,
        backgroundColor: '#10b981',
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginBottom: 12,
    },
    label: {
        color: '#121212',
        fontSize: 14,
        fontWeight: '700',
    },
});

export default ListenNowButton;
