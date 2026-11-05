import { Overflow, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import { inlineFlexRowStyles, tagListStyles } from '../styles';

export const SkillTags = ({ tags, wrap = false }: { tags: Record<string, string>; wrap?: boolean }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const entries = Object.entries(tags);
  if (entries.length === 0) {
    return (
      <span
        aria-label={intl.formatMessage({
          defaultMessage: 'No tags',
          description: 'Accessible name when a skill has no tags',
        })}
      >
        —
      </span>
    );
  }
  const tagNodes = entries.map(([key, value]) => <KeyValueTag key={key} css={{ margin: 0 }} tag={{ key, value }} />);
  return (
    <div
      css={wrap ? tagListStyles(theme) : inlineFlexRowStyles(theme)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          e.stopPropagation();
        }
      }}
    >
      {wrap ? tagNodes : <Overflow>{tagNodes}</Overflow>}
    </div>
  );
};
