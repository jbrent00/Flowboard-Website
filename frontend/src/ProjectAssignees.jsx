import { memberName } from './projectMemberApi.js'

export function AssigneeChoices({ members, status, selectedIds, onChange, disabled, lockedUserId, lockReason }) {
  return <fieldset className="projectAssigneeChoices" disabled={disabled}>
    <legend>Assignees (optional)</legend>
    {lockReason && <p>{lockReason}</p>}
    {status === 'loading' && <span role="status">Loading project members...</span>}
    {status === 'error' && <span>Assignees are unavailable. Open Members to retry.</span>}
    {status === 'ready' && members.map(({ userId, user }) => {
      const selected = selectedIds.includes(userId)
      const name = memberName(user)
      return <label key={userId}>
        <input type="checkbox" checked={selected} disabled={userId === lockedUserId} onChange={() => onChange(selected
          ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId])} />
        <span>{name}{user.primaryEmail && name !== user.primaryEmail && ` (${user.primaryEmail})`}</span>
      </label>
    })}
  </fieldset>
}

export function TaskAssignees({ members, assigneeIds }) {
  if (!members && assigneeIds.length > 0) return <p>Assignees: {assigneeIds.length}</p>
  const names = members?.filter((member) => assigneeIds.includes(member.userId))
    .map((member) => memberName(member.user)) ?? []
  return <p>{names.length ? `Assignees: ${names.join(', ')}` : 'Unassigned'}</p>
}
