import { AiDisclosureSettings } from "@/components/settings/ai-disclosure-settings";
import { AssetsForm } from "@/components/brand/assets-form";
import { AudiencesForm } from "@/components/brand/audiences-form";
import { ChannelsForm } from "@/components/brand/channels-form";
import { IdentityForm } from "@/components/brand/identity-form";
import { LogosPanel } from "@/components/brand/logos-panel";
import { MessagingForm } from "@/components/brand/messaging-form";
import { RulesForm } from "@/components/brand/rules-form";
import { VisualForm } from "@/components/brand/visual-form";
import { VoiceForm } from "@/components/brand/voice-form";
import type { BrandSection } from "@/lib/brand/schema";
import { workspacePath } from "@/lib/nav";
import type { BrandSectionData } from "./load";

type Props = { section: BrandSection; workspaceId: string; canEdit: boolean; data: BrandSectionData };

export function BrandSectionBody({ section, workspaceId, canEdit, data }: Props) {
  const { kit } = data;
  switch (section) {
    case "identity":
      return <IdentityForm workspaceId={workspaceId} initial={kit.identity} canEdit={canEdit} />;
    case "voice":
      return <VoiceForm workspaceId={workspaceId} voice={kit.voice} rules={kit.voiceRules} canEdit={canEdit} aiEnabled={data.aiEnabled} />;
    case "visual":
      return (
        <div className="flex flex-col gap-10">
          <LogosPanel workspaceId={workspaceId} logos={data.logos} canEdit={canEdit} />
          <VisualForm workspaceId={workspaceId} initial={kit.visual} canEdit={canEdit} />
        </div>
      );
    case "messaging":
      return <MessagingForm workspaceId={workspaceId} initial={kit.messaging} canEdit={canEdit} />;
    case "audiences":
      return <AudiencesForm workspaceId={workspaceId} initial={kit.audiences} canEdit={canEdit} />;
    case "rules":
      return (
        <>
          <RulesForm workspaceId={workspaceId} initial={kit.rules} canEdit={canEdit} />
          <AiDisclosureSettings workspaceId={workspaceId} initial={data.requireAiDisclosure} canEdit={canEdit} />
        </>
      );
    case "channels":
      return <ChannelsForm workspaceId={workspaceId} initial={kit.channels} networks={data.networks} canEdit={canEdit} />;
    case "assets":
      return <AssetsForm workspaceId={workspaceId} initial={kit.assets} library={data.library} libraryHref={workspacePath(workspaceId, "content")} canEdit={canEdit} />;
  }
}
