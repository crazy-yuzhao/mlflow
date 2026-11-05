/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import React from 'react';
import { FormattedMessage } from 'react-intl';
import Utils from '../../utils/Utils';

type Props = {
  showServerError?: boolean;
};

type State = any;

export class SectionErrorBoundary extends React.Component<Props, State> {
  state = { error: null };

  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ error });
  }

  renderErrorMessage(error: any) {
    return this.props.showServerError ? <div>Error message: {error.message}</div> : '';
  }

  render() {
    const { children } = this.props;
    const { error } = this.state;
    if (error) {
      return (
        <div>
          <p>
            <i
              data-testid="icon-fail"
              className="fa fa-exclamation-triangle mlflow-icon-fail"
              css={classNames.wrapper}
            />
            <FormattedMessage
              defaultMessage="Something went wrong with this section. If this error persists, please report an issue <link>here</link>."
              description="Section error boundary text that links to the support page"
              values={{
                link: (chunks) => (
                  // eslint-disable-next-line react/jsx-no-target-blank
                  <a href={Utils.getSupportPageUrl()} target="_blank">
                    {chunks}
                  </a>
                ),
              }}
            />
            {this.renderErrorMessage(error)}
          </p>
        </div>
      );
    }

    return children;
  }
}

const classNames = {
  wrapper: {
    marginLeft: -2, // to align the failure icon with the collapsable section caret toggle
  },
};
