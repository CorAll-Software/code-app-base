// Example

import { Spin } from 'antd';
import type React from 'react';
import { useState, useEffect } from 'react';

type Props = {
    children: React.ReactNode;
    waitBeforeShow?: number;
};

export const Delayed = ({ children, waitBeforeShow = 500 }: Props) => {
    const [isShown, setIsShown] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsShown(true);
        }, waitBeforeShow);
        return () => clearTimeout(timer);
    }, [waitBeforeShow]);

    return isShown ? children : <Spin style={
        {
            width: '100%',
            minHeight: '400px',
        }
    } />;
};