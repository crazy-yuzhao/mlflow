import { Overflow, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import { inlineFlexRowStyles } from '../styles';

export const MCPServerTags = ({ tags }: { tags: Record<string, string> }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const entries = Object.entries(tags);
  if (entries.length === 0) {
    return (
      <span
        aria-label={intl.formatMessage({
          defaultMessage: 'No tags',
          description: 'Accessible name when an MCP server has no tags',
        })}
      >
        —
      </span>
    );
  }
  return (
    <div
      css={inlineFlexRowStyles(theme)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          e.stopPropagation();
        }
      }}
    >
      <Overflow>
        {entries.map(([key, value]) => (
          <KeyValueTag key={key} css={{ margin: 0 }} tag={{ key, value }} />
        ))}
      </Overflow>
    </div>
  );
};
