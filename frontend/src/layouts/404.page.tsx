import { Button, Result } from 'antd';
import { Link } from 'react-router-dom';

interface NotFoundPageProps {
    /** Texto bajo la ilustración. Por defecto, el de página inexistente. */
    mensaje?: string;
}

export const NotFoundPage = ({ mensaje = 'Esta página no existe.' }: NotFoundPageProps) => {
    return (
        <div className='flex-center'>
            <Result
                subTitle={mensaje}
                icon={<img src="/svg/404.svg" alt="" style={{ width: '100%' }} />}
                extra={
                    <Link to="/">
                        <Button type="primary">Ir al inicio</Button>
                    </Link>
                }
            />
        </div>
    )
};
