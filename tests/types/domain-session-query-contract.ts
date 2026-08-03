import {
  endAgentSession,
  endConsumerSession,
  getAgentSession,
  listAgentSessions,
  startAgentSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import type { ConsumerAuthority } from "../../cli/lib/store/consumer-auth.js";
import type {
  AgentSessionDto,
  Page,
} from "../../cli/lib/store/types.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type SessionDtoHasExactKeys = Assert<
  Equal<
    keyof AgentSessionDto,
    | "id"
    | "workspaceId"
    | "projectId"
    | "agent"
    | "startedAt"
    | "endedAt"
  >
>;
type StartSessionReturnsSafeDto = Assert<
  Equal<ReturnType<typeof startAgentSession>, AgentSessionDto>
>;
type GetSessionReturnsSafeDto = Assert<
  Equal<ReturnType<typeof getAgentSession>, AgentSessionDto>
>;
type EndSessionReturnsSafeDto = Assert<
  Equal<ReturnType<typeof endAgentSession>, AgentSessionDto>
>;
type StartConsumerSessionReturnsSafeDto = Assert<
  Equal<ReturnType<typeof startConsumerSession>, AgentSessionDto>
>;
type StartConsumerSessionRequiresAuthority = Assert<
  Equal<Parameters<typeof startConsumerSession>[0], ConsumerAuthority>
>;
type ConsumerSessionInputHasNoPrincipal = Assert<
  Equal<
    keyof Parameters<typeof startConsumerSession>[1],
    "workspaceId" | "projectId" | "metadata"
  >
>;
type EndConsumerSessionReturnsSafeDto = Assert<
  Equal<ReturnType<typeof endConsumerSession>, AgentSessionDto>
>;
type ListSessionsReturnsSafePage = Assert<
  Equal<ReturnType<typeof listAgentSessions>, Page<AgentSessionDto>>
>;

export type DomainSessionQueryContract = [
  SessionDtoHasExactKeys,
  StartSessionReturnsSafeDto,
  GetSessionReturnsSafeDto,
  EndSessionReturnsSafeDto,
  StartConsumerSessionReturnsSafeDto,
  StartConsumerSessionRequiresAuthority,
  ConsumerSessionInputHasNoPrincipal,
  EndConsumerSessionReturnsSafeDto,
  ListSessionsReturnsSafePage,
];
