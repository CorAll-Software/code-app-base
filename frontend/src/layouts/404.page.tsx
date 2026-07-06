import { Result } from 'antd';

export const NotFoundPage = () => {
    return (
        <div className='flex-center'>
            <Result
                subTitle="Lo sentimos, la página que ha visitado no existe."
                icon={<img src="/svg/404.svg" alt="404 Not Found" style={{ width: '100%' }} />}
            />
        </div>
    )
};
