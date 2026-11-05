import {
  Button,
  FullscreenExitIcon,
  FullscreenIcon,
  Tooltip,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomToFitIcon,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { useIntl } from '@databricks/i18n';

interface GraphViewFloatingToolbarProps {
  isGraphExpanded: boolean;
  onToggleGraphExpand: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export const GraphViewFloatingToolbar = ({
  isGraphExpanded,
  onToggleGraphExpand,
  onFitView,
  onZoomIn,
  onZoomOut,
}: GraphViewFloatingToolbarProps) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const collapseGraphLabel = intl.formatMessage({
    defaultMessage: 'Collapse graph',
    description: 'Tooltip for the button that collapses the graph view',
  });
  const expandGraphLabel = intl.formatMessage({
    defaultMessage: 'Expand graph',
    description: 'Tooltip for the button that expands the graph view',
  });
  const fitToViewLabel = intl.formatMessage({
    defaultMessage: 'Fit to view',
    description: 'Tooltip for the button that fits the graph to the viewport',
  });
  const zoomInLabel = intl.formatMessage({
    defaultMessage: 'Zoom in',
    description: 'Tooltip for the button that zooms in on the graph',
  });
  const zoomOutLabel = intl.formatMessage({
    defaultMessage: 'Zoom out',
    description: 'Tooltip for the button that zooms out of the graph',
  });

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        borderRadius: theme.borders.borderRadiusMd,
        overflow: 'hidden',
        boxShadow: theme.shadows.md,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <Tooltip
        componentId="graph-view-toolbar.expand"
        content={isGraphExpanded ? collapseGraphLabel : expandGraphLabel}
        side="left"
      >
        <Button
          componentId="graph-view-toolbar.expand-button"
          icon={isGraphExpanded ? <FullscreenExitIcon /> : <FullscreenIcon />}
          size="small"
          aria-label={isGraphExpanded ? collapseGraphLabel : expandGraphLabel}
          onClick={onToggleGraphExpand}
          css={toolbarButtonStyle(theme)}
        />
      </Tooltip>
      <Tooltip componentId="graph-view-toolbar.fit-view" content={fitToViewLabel} side="left">
        <Button
          componentId="graph-view-toolbar.fit-view-button"
          icon={<ZoomToFitIcon />}
          size="small"
          aria-label={fitToViewLabel}
          onClick={onFitView}
          css={toolbarButtonStyle(theme)}
        />
      </Tooltip>
      <Tooltip componentId="graph-view-toolbar.zoom-in" content={zoomInLabel} side="left">
        <Button
          componentId="graph-view-toolbar.zoom-in-button"
          icon={<ZoomInIcon />}
          size="small"
          aria-label={zoomInLabel}
          onClick={onZoomIn}
          css={toolbarButtonStyle(theme)}
        />
      </Tooltip>
      <Tooltip componentId="graph-view-toolbar.zoom-out" content={zoomOutLabel} side="left">
        <Button
          componentId="graph-view-toolbar.zoom-out-button"
          icon={<ZoomOutIcon />}
          size="small"
          aria-label={zoomOutLabel}
          onClick={onZoomOut}
          css={toolbarButtonStyle(theme)}
        />
      </Tooltip>
    </div>
  );
};

const toolbarButtonStyle = (theme: ReturnType<typeof useDesignSystemTheme>['theme']) => ({
  borderRadius: 0,
  border: 'none',
  backgroundColor: theme.colors.backgroundPrimary,
  color: theme.colors.textSecondary,
  '&:hover': {
    backgroundColor: theme.colors.actionTertiaryBackgroundHover,
  },
});
