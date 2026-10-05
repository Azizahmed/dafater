import { Avatar, uniReactRoot } from '@affine/component';
import {
  createGroupByConfig,
  type GroupRenderProps,
  t as types,
  ungroups,
} from '@blocksuite/affine/blocks/database';
import { t } from '@blocksuite/affine/global/i18n';
import type { UserService } from '@blocksuite/affine-shared/services';

import { useMemberInfo } from '../hooks/use-member-info';
import {
  avatar,
  memberName,
  memberPreviewContainer,
} from '../properties/member/style.css';

const MemberPreview = ({
  memberId,
  userService,
}: {
  memberId: string;
  userService: UserService | null | undefined;
}) => {
  const userInfo = useMemberInfo(memberId, userService);
  if (!userInfo) {
    return null;
  }
  return (
    <div className={memberPreviewContainer}>
      <Avatar
        name={userInfo.removed ? undefined : (userInfo.name ?? undefined)}
        className={avatar}
        url={!userInfo.removed ? userInfo.avatar : undefined}
        size={20}
      />
      <div className={memberName}>
        {userInfo.removed ? t('Deleted user') : userInfo.name || t('Unnamed')}
      </div>
    </div>
  );
};
const MemberGroupView = (props: GroupRenderProps<string | null, {}>) => {
  const tType = props.group.tType;
  if (!types.user.is(tType)) return t('Ungroup');
  const memberId = props.group.value;
  if (memberId == null) return t('Ungroup');

  return (
    <MemberPreview
      memberId={memberId}
      userService={tType.data?.userService}
    ></MemberPreview>
  );
};

const MultiMemberGroupView = (props: GroupRenderProps<string | null, {}>) => {
  const tType = props.group.tType;
  if (!types.array.is(tType) || !types.user.is(tType.element))
    return t('Ungroup');
  const memberId = props.group.value;
  if (memberId == null) return t('Ungroup');

  return (
    <MemberPreview
      memberId={memberId}
      userService={tType.element.data?.userService}
    ></MemberPreview>
  );
};

export const groupByConfigList = [
  createGroupByConfig({
    name: 'member',
    matchType: types.user.instance(),
    groupName: (type, value: string | null) => {
      if (types.user.is(type) && typeof value === 'string') {
        const userService = type.data?.userService;
        if (userService) {
          const userInfo = userService.userInfo$(value).value;
          if (userInfo && !userInfo?.removed) {
            return userInfo.name ?? t('Unnamed');
          }
        }
      }
      return '';
    },
    defaultKeys: () => {
      return [ungroups];
    },
    valuesGroup: value => {
      if (typeof value !== 'string') {
        return [ungroups];
      }
      return [
        {
          key: value,
          value: value,
        },
      ];
    },
    addToGroup: v => v,
    view: uniReactRoot.createUniComponent(MemberGroupView),
  }),
  createGroupByConfig({
    name: 'multi-member',
    matchType: types.array.instance(types.user.instance()),
    groupName: (_type, value: string | null) => {
      if (
        types.array.is(_type) &&
        types.user.is(_type.element) &&
        typeof value === 'string'
      ) {
        const userService = _type.element.data?.userService;
        if (userService) {
          const userInfo = userService.userInfo$(value).value;
          if (userInfo && !userInfo?.removed) {
            return userInfo.name ?? t('Unnamed');
          }
        }
      }
      return '';
    },
    defaultKeys: _type => {
      return [ungroups];
    },
    valuesGroup: (value, _type) => {
      if (!Array.isArray(value) || value.length === 0) {
        return [ungroups];
      }
      return value.map(id => ({
        key: id,
        value: id,
      }));
    },
    addToGroup: (value, old) => {
      if (value == null) {
        return old;
      }
      return Array.isArray(old) ? [...old, value] : [value];
    },
    removeFromGroup: (value, old) => {
      if (Array.isArray(old)) {
        return old.filter(v => v !== value);
      }
      return old;
    },
    view: uniReactRoot.createUniComponent(MultiMemberGroupView),
  }),
];
