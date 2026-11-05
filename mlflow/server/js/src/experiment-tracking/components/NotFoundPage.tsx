import React, { Component } from 'react';
import { FormattedMessage } from 'react-intl';

class NotFoundPage extends Component {
  render() {
    return (
      <div>
        <FormattedMessage
          defaultMessage="Resource not found."
          description="Message shown when a requested page or resource does not exist"
        />
      </div>
    );
  }
}

export default NotFoundPage;
