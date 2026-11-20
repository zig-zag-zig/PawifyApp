import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as Linking from "expo-linking";
import React from "react";
import {
  Clipboard,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SelectableText } from "../../../components/ui";
import { ArtistChips } from "../../../components/ArtistChips";
import ExternalLinksGrid from "../../../components/ExternalLinksGrid";
import {
  loadPreferredStreamingService,
  savePreferredStreamingService,
} from "../../../services/preferredStreamingService";
import { ResponsiveHeaderImage } from "../../../components/ResponsiveHeaderImage";
import {
  formatDisplayDate,
  deriveReleaseGroupReleaseListMetadata,
  isOfficialReleaseStatus,
  nameWithDisambiguation,
  type ArtistCredit,
  type ExternalLinkService,
  type Release,
} from "@pawify/shared";
import { getStyles } from "../../../styles/styles";
import { theme } from "../../../styles/theme";
import {
  getCountryDisplay,
  type CountryDisplay,
} from "../domain/countryDisplay";
import { ArtistNavigationProp } from "../../../types/navigation";

interface ReleaseHeaderProps {
  release: Release;
}

function dedupeArtistCredits(artistCredits: ArtistCredit[]): ArtistCredit[] {
  return artistCredits.filter(
    (artist, index, all) =>
      all.findIndex((other) => other.id === artist.id) === index,
  );
}

const ReleaseHeader = ({ release }: ReleaseHeaderProps) => {
  const styles = getStyles();
  const navigation = useNavigation<ArtistNavigationProp>();
  const artistCredits = React.useMemo(
    () => dedupeArtistCredits(release["artist-credit"]),
    [release],
  );
  const [preferredService, setPreferredService] =
    React.useState<ExternalLinkService | null>(null);
  const [copiedBarcode, setCopiedBarcode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copiedBarcode) return;
    const timer = setTimeout(() => setCopiedBarcode(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedBarcode]);

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

  const onPreferredServiceChange = React.useCallback(
    (service: ExternalLinkService) => {
      setPreferredService(service);
      void savePreferredStreamingService(service);
    },
    [],
  );

  const onShare = React.useCallback(() => {
    const releaseTitle = nameWithDisambiguation(
      release.disambiguation,
      release.title,
    );
    const artistNames = dedupeArtistCredits(release["artist-credit"])
      .map((artist) => artist.name)
      .join(", ");
    const link = Linking.createURL(`release/${release.id}`);

    void Share.share({
      message: `${releaseTitle}${artistNames ? ` by ${artistNames}` : ""} — ${link}`,
      url: link,
    }).catch(() => {
      // User dismissed the sheet — nothing to do.
    });
  }, [release]);

  const releaseTitle = nameWithDisambiguation(
    release.disambiguation,
    release.title,
  );
  const displayDate = formatDisplayDate(release.date, release.date_for_display);
  const releaseType = release["release-group"]?.["primary-type"];
  const trackCount = React.useMemo(
    () =>
      (release.media ?? []).reduce(
        (total, medium) => total + (medium.tracks?.length ?? 0),
        0,
      ),
    [release.media],
  );
  const editionMetadata = React.useMemo(
    () => deriveReleaseGroupReleaseListMetadata(release),
    [release.media],
  );
  const editionDetails = React.useMemo(() => {
    const details: Array<{
      label: string;
      value: string;
      copyable?: boolean;
      country?: CountryDisplay;
    }> = [];

    if (release.barcode?.trim()) {
      details.push({
        label: "Barcode",
        value: release.barcode.trim(),
        copyable: true,
      });
    }
    const country = getCountryDisplay(release.country);
    if (country) {
      details.push({ label: "Country", value: country.code, country });
    }
    if (release.status?.trim() && !isOfficialReleaseStatus(release.status)) {
      details.push({ label: "Status", value: release.status.trim() });
    }
    if (editionMetadata.formats.length > 0) {
      details.push({
        label: "Format",
        value: editionMetadata.formats.join(" + "),
      });
    }

    return details;
  }, [editionMetadata, release.barcode, release.country, release.status]);

  return (
    <View style={{ backgroundColor: styles.container.backgroundColor }}>
      <ResponsiveHeaderImage
        imageUrl={release.cover_url}
        type="release"
        containerStyle={styles.releaseCoverContainer}
        borderRadius={8}
        entityType="release"
        entityId={release.id}
      />
      <View style={styles.textContainer}>
        <View style={headerStyles.titleRow}>
          <SelectableText style={[styles.releaseTitle, headerStyles.titleText]}>
            {releaseTitle}
          </SelectableText>
          <TouchableOpacity
            onPress={onShare}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`Share ${releaseTitle}`}
            style={headerStyles.shareButton}
            hitSlop={8}
          >
            <MaterialIcons name="share" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        <ArtistChips
          artists={artistCredits}
          onArtistPress={(artistId) =>
            navigation.navigate("Artist", { artistId })
          }
        />

        <View style={tagStyles.tagsRow}>
          {releaseType ? (
            <View style={[tagStyles.tagPill, tagStyles.tagPillCyan]}>
              <SelectableText
                style={[tagStyles.tagText, tagStyles.tagTextCyan]}
                selectable={false}
              >
                {releaseType}
              </SelectableText>
            </View>
          ) : null}
          <View style={[tagStyles.tagPill, tagStyles.tagPillAmber]}>
            <SelectableText
              style={[tagStyles.tagText, tagStyles.tagTextAmber]}
              selectable={false}
            >
              {displayDate}
            </SelectableText>
          </View>
          {trackCount > 0 ? (
            <View style={[tagStyles.tagPill, tagStyles.tagPillViolet]}>
              <SelectableText
                style={[tagStyles.tagText, tagStyles.tagTextViolet]}
                selectable={false}
              >
                {trackCount === 1 ? "1 track" : `${trackCount} tracks`}
              </SelectableText>
            </View>
          ) : null}
        </View>

        {editionDetails.length > 0 && (
          <View
            style={editionStyles.container}
            accessibilityLabel="Edition details"
          >
            <Text style={editionStyles.heading}>Edition details</Text>
            {editionDetails.map((detail) => (
              <View key={detail.label} style={editionStyles.row}>
                <Text style={editionStyles.label}>{detail.label}</Text>
                {detail.country ? (
                  <CountryDetailValue country={detail.country} />
                ) : detail.copyable ? (
                  <TouchableOpacity
                    onPress={() => {
                      Clipboard.setString(detail.value);
                      setCopiedBarcode(detail.value);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy barcode ${detail.value}`}
                    style={editionStyles.copyValue}
                  >
                    <SelectableText
                      style={editionStyles.value}
                      selectable={false}
                    >
                      {copiedBarcode === detail.value ? "Copied" : detail.value}
                    </SelectableText>
                  </TouchableOpacity>
                ) : (
                  <SelectableText
                    style={editionStyles.value}
                    selectable={false}
                  >
                    {detail.value}
                  </SelectableText>
                )}
              </View>
            ))}
          </View>
        )}

        <ExternalLinksGrid
          links={release.externalLinks}
          preferredService={preferredService}
          onPreferredServiceChange={onPreferredServiceChange}
        />
      </View>
    </View>
  );
};

const CountryDetailValue = ({ country }: { country: CountryDisplay }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <View style={editionStyles.countryWrap}>
      <TouchableOpacity
        onPress={() => setExpanded((value) => !value)}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={`${country.name}${country.code ? ` (${country.code})` : ""}. ${expanded ? "Hide" : "Show"} country name.`}
        style={editionStyles.countryChip}
      >
        <Text style={editionStyles.countryFlag}>{country.flag}</Text>
        <Text style={editionStyles.countryCode}>{country.code}</Text>
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={16}
          color="#94A3B8"
        />
      </TouchableOpacity>
      {expanded && (
        <View style={editionStyles.countryNameCard}>
          <Text style={editionStyles.countryName}>{country.name}</Text>
        </View>
      )}
    </View>
  );
};

const headerStyles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 18,
  },
  titleText: {
    flex: 1,
    paddingVertical: 0,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(154, 160, 170, 0.35)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
});

const chipStyles = StyleSheet.create({
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.52)",
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: "#81ddff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
});

const tagStyles = StyleSheet.create({
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tagPill: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.tagPillBorder,
    backgroundColor: theme.colors.tagPillBackground,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagPillCyan: {
    borderColor: "rgba(92, 225, 230, 0.58)",
    backgroundColor: "rgba(92, 225, 230, 0.14)",
  },
  tagPillViolet: {
    borderColor: "rgba(180, 160, 255, 0.58)",
    backgroundColor: "rgba(180, 160, 255, 0.14)",
  },
  tagPillAmber: {
    borderColor: "rgba(232, 184, 109, 0.58)",
    backgroundColor: "rgba(232, 184, 109, 0.14)",
  },
  tagText: {
    color: theme.colors.tagPillText,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    lineHeight: 15,
  },
  tagTextCyan: {
    color: "#5CE1E6",
  },
  tagTextViolet: {
    color: "#B4A0FF",
  },
  tagTextAmber: {
    color: "#E8B86D",
  },
});

const editionStyles = StyleSheet.create({
  container: {
    marginTop: 4,
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    backgroundColor: "rgba(30, 41, 59, 0.28)",
  },
  heading: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 3,
  },
  label: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  value: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    flexShrink: 1,
    textAlign: "right",
  },
  copyValue: {
    flexShrink: 1,
    alignItems: "flex-end",
  },
  countryWrap: {
    alignItems: "flex-end",
    gap: 6,
    maxWidth: "72%",
  },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
  },
  countryFlag: {
    fontSize: 16,
    lineHeight: 18,
  },
  countryCode: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  countryNameCard: {
    borderWidth: 1,
    borderColor: "rgba(92, 225, 230, 0.32)",
    backgroundColor: "rgba(92, 225, 230, 0.10)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  countryName: {
    color: "#E2F8FA",
    fontSize: 12,
    fontWeight: "600",
  },
});

export default ReleaseHeader;
