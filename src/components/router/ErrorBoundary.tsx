import classNames from 'classnames';
import React, { type FC, useEffect } from 'react';
import { useRouteError } from 'react-router-dom';

import loading from 'components/loading/loading';
import Page from 'components/Page';

import './ErrorBoundary.scss';

interface ErrorBoundaryParams {
    pageClasses?: string[]
}

const ErrorBoundary: FC<ErrorBoundaryParams> = ({
    pageClasses = [ 'libraryPage' ]
}) => {
    const error = useRouteError() as Error;

    useEffect(() => {
        loading.hide();
    }, []);

    return (
        <Page
            id='errorBoundary'
            className={classNames('mainAnimatedPage', pageClasses)}
        >
            <div className='content-primary'>
                <section className='routeError' role='alert'>
                    <h1>{error.name}</h1>
                    <p>{error.message}</p>
                    {error.stack && (
                        <pre className='routeErrorTrace'>{error.stack}</pre>
                    )}
                </section>
            </div>
        </Page>
    );
};

export default ErrorBoundary;
