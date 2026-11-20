import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CachedImageComponent } from "../../../components/cachedImage/CachedImageComponent";
import {
  InlineLink,
  ScreenContainer,
  SelectableText,
} from "../../../components/ui";
import type { ArtistCredit, ReleaseGroupReleaseListItem } from "@pawify/shared";
import {
  ArtistChips,
  formatArtistCreditNames,
} from "../../../components/ArtistChips";
import {
  formatReleaseEditionAccessibilityLabel,
  formatReleaseEditionSummary,
} from "../domain/releaseEditionSummary";

interface ReleaseGroupCardProps {
  releaseGroupTitle: string | null;
  releases: ReleaseGroupReleaseListItem[];
  releaseCount: number;
  groupArtistCredit?: ArtistCredit[];
  releaseCovers: Record<string, string | null | undefined>;
  pendingReleaseCoverIds: string[];
  releaseGroupId: string | null;
  onArtistPress?: (artistId: string) => void;
  isLoadingReleases: boolean;
  releaseLoadFailed: boolean;
  releaseGroupNotFound: boolean;
  onPress: (release: ReleaseGroupReleaseListItem) => void;
  onRetryLoadReleases: () => void;
  onContentReady: () => void;
}

const ReleaseGroupCard = ({
  releaseGroupTitle,
  releases,
  releaseCount,
  groupArtistCredit = [],
  releaseCovers,
  pendingReleaseCoverIds,
  releaseGroupId,
  onArtistPress,
  isLoadingReleases,
  releaseLoadFailed,
  releaseGroupNotFound,
  onPress,
  onRetryLoadReleases,
  onContentReady,
}: ReleaseGroupCardProps) => {
  const pendingReleaseCoverIdSet = new Set(pendingReleaseCoverIds);
  const releaseCountLabel =
    releaseCount > 0
      ? `${releaseCount} ${releaseCount === 1 ? "release" : "releases"}`
      : "Releases";

  const onShare = React.useCallback(() => {
    if (!releaseGroupId) {
      return;
    }

    const link = Linking.createURL(`release-group/${releaseGroupId}`);
    const title = releaseGroupTitle ?? undefined;
    void Share.share({
      message: `${title ? `${title} — ` : ""}${link}`,
      url: link,
    }).catch(() => {
      // User dismissed the sheet — nothing to do.
    });
  }, [releaseGroupId, releaseGroupTitle]);

  return (
    <ScreenContainer>
      <View style={cardStyles.headerBlock}>
        <View style={cardStyles.titleRow}>
          <Text style={cardStyles.groupTitle} numberOfLines={2}>
            {releaseGroupTitle ?? "Release group"}
          </Text>
          {releaseGroupId && (
            <TouchableOpacity
              onPress={onShare}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Share this release group"
              style={cardStyles.shareButton}
              hitSlop={8}
            >
              <MaterialIcons name="share" size={20} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>
        {groupArtistCredit.length > 0 && (
          <View style={cardStyles.groupArtists}>
            <ArtistChips
              artists={groupArtistCredit}
              onArtistPress={onArtistPress}
            />
          </View>
        )}
        <Text style={cardStyles.headerTitle}>{releaseCountLabel}</Text>
      </View>
      {releaseGroupNotFound ? (
        <View style={cardStyles.errorState}>
          <Text style={cardStyles.errorText}>
            This release group was not found in the local catalogue.
          </Text>
        </View>
      ) : releaseLoadFailed ? (
        <View style={cardStyles.errorState}>
          <Text style={cardStyles.errorText}>
            Unable to load this release group.
          </Text>
          <InlineLink onPress={onRetryLoadReleases}>Retry</InlineLink>
        </View>
      ) : (
        <FlatList
          style={cardStyles.releaseList}
          contentContainerStyle={cardStyles.releaseListContent}
          data={releases}
          keyExtractor={(release) => `release-${release.id}`}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={onContentReady}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            isLoadingReleases ? (
              <View
                style={cardStyles.loadingState}
                accessibilityLabel="Loading releases"
                accessibilityState={{ busy: true }}
              >
                <ActivityIndicator size="large" color="#81ddff" />
              </View>
            ) : (
              <Text style={cardStyles.emptyText}>No releases available.</Text>
            )
          }
          renderItem={({ item: release }) => {
            const editionSummary = formatReleaseEditionSummary({
              formats: release.formats,
              trackCount: release.trackCount,
              date: release.date,
              status: release.status,
              country: release.country,
            });
            const groupArtistIds = groupArtistCredit
              .map((artist) => artist.id)
              .sort()
              .join("|");
            const releaseArtistIds = (release.artistCredit ?? [])
              .map((artist) => artist.id)
              .sort()
              .join("|");
            const releaseArtistNames = formatArtistCreditNames(
              release.artistCredit ?? [],
            );
            const showReleaseArtists =
              releaseArtistNames.length > 0 &&
              releaseArtistIds !== groupArtistIds;

            return (
              <TouchableOpacity
                onPress={() => onPress(release)}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={formatReleaseEditionAccessibilityLabel(
                  release.title,
                  editionSummary,
                )}
                style={cardStyles.releaseRow}
              >
                <CachedImageComponent
                  imageUrl={releaseCovers[release.id]}
                  type="release"
                  showSpinnerWhenNoImage={pendingReleaseCoverIdSet.has(
                    release.id,
                  )}
                  entityType="release"
                  entityId={release.id}
                  style={cardStyles.releaseCover}
                />
                <View style={cardStyles.releaseTextGroup}>
                  <SelectableText
                    style={cardStyles.releaseTitle}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    selectable={false}
                  >
                    {release.title}
                  </SelectableText>
                  {editionSummary ? (
                    <SelectableText
                      style={cardStyles.releaseEdition}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      selectable={false}
                    >
                      {editionSummary}
                    </SelectableText>
                  ) : null}
                  {showReleaseArtists ? (
                    <SelectableText
                      style={cardStyles.releaseArtists}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      selectable={false}
                    >
                      {releaseArtistNames}
                    </SelectableText>
                  ) : null}
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#64748B" />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
};

const cardStyles = StyleSheet.create({
  headerBlock: {
    marginBottom: 14,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
  },
  groupTitle: {
    color: "#F1F5F9",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    flex: 1,
    paddingTop: 6,
  },
  groupArtists: {
    paddingRight: 4,
  },
  headerTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  loadingState: {
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
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
  releaseList: {
    flex: 1,
  },
  releaseListContent: {
    paddingBottom: 24,
  },
  releaseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.14)",
    backgroundColor: "rgba(30, 41, 59, 0.34)",
  },
  releaseCover: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  releaseTextGroup: {
    flex: 1,
    gap: 4,
  },
  releaseTitle: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  releaseEdition: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  releaseArtists: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
  errorState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 14,
    textAlign: "center",
  },
});

export default ReleaseGroupCard;
